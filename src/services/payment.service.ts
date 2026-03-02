import stripe from '../config/stripe';
import { db } from '../config/firebase';
import { Payment, CreatePaymentRequest, ConfirmPaymentRequest } from '../models/wallet.model';
import { BookingService } from './booking.service';
import * as WalletService from './wallet.service';

export class PaymentService {
  // Crear Payment Intent para una reserva
  static async createPaymentIntent(request: CreatePaymentRequest): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
  }> {
    try {
      const { bookingId, userId, amount, currency = 'mxn', paymentMethodId } = request;

      // Verificar que la reserva existe
      const booking = await BookingService.getBookingById(bookingId);
      if (!booking) {
        throw new Error('Reserva no encontrada');
      }

      if (booking.touristId !== userId) {
        throw new Error('No tienes permiso para pagar esta reserva');
      }

      // Obtener el customer de Stripe del usuario
      const walletDoc = await db.collection('wallets').doc(userId).get();
      let stripeCustomerId: string | undefined;

      if (walletDoc.exists && walletDoc.data()?.stripeCustomerId) {
        stripeCustomerId = walletDoc.data()?.stripeCustomerId;
      }

      // Crear el Payment Intent
      const paymentIntentData: any = {
        amount: Math.round(amount * 100), // Stripe usa centavos
        currency,
        metadata: {
          bookingId,
          userId,
          guideId: booking.guideId,
        },
      };

      // Si hay customer ID, agregarlo
      if (stripeCustomerId) {
        paymentIntentData.customer = stripeCustomerId;
      }

      // Si se especifica un payment method, configurarlo
      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirm = false; // El frontend lo confirmará explícitamente
      } else {
        paymentIntentData.automatic_payment_methods = {
          enabled: true,
        };
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      // Guardar el pago en Firestore
      await db.collection('payments').add({
        bookingId,
        userId,
        amount,
        currency,
        paymentIntentId: paymentIntent.id,
        paymentMethodId: paymentMethodId || '',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || '',
        amount,
      };
    } catch (error) {
      console.error('Error al crear Payment Intent:', error);
      throw error;
    }
  }

  // Confirmar pago con tarjeta guardada
  static async confirmPaymentWithSavedCard(request: ConfirmPaymentRequest): Promise<{
    success: boolean;
    paymentIntentId: string;
    status: string;
  }> {
    try {
      const { paymentIntentId, paymentMethodId } = request;

      // Confirmar el payment intent con el método de pago
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      // Actualizar el estado del pago en Firestore
      const paymentQuery = await db.collection('payments')
        .where('paymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (!paymentQuery.empty && paymentQuery.docs[0]) {
        const paymentDoc = paymentQuery.docs[0];
        await paymentDoc.ref.update({
          status: paymentIntent.status,
          paymentMethodId,
          updatedAt: new Date(),
        });

        const paymentData = paymentDoc.data();

        // Si el pago es exitoso, actualizar la reserva
        if (paymentIntent.status === 'succeeded') {
          await BookingService.updateBookingStatus(
            paymentData.bookingId,
            'pagado',
            paymentIntentId
          );
        }
      }

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      console.error('Error al confirmar pago:', error);
      throw error;
    }
  }

  // Obtener estado del pago
  static async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    amount: number;
    currency: string;
  }> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (error) {
      console.error('Error al obtener estado del pago:', error);
      throw error;
    }
  }

  // Cancelar pago
  static async cancelPayment(paymentIntentId: string, userId: string): Promise<void> {
    try {
      // Verificar que el pago pertenece al usuario
      const paymentQuery = await db.collection('payments')
        .where('paymentIntentId', '==', paymentIntentId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (paymentQuery.empty) {
        throw new Error('Pago no encontrado o no tienes permiso');
      }

      // Cancelar en Stripe
      await stripe.paymentIntents.cancel(paymentIntentId);

      // Actualizar en Firestore
      const paymentDoc = paymentQuery.docs[0];
      if (paymentDoc) {
        await paymentDoc.ref.update({
          status: 'canceled',
          updatedAt: new Date(),
        });

        // Actualizar la reserva
        const paymentData = paymentDoc.data();
        await BookingService.updateBookingStatus(paymentData.bookingId, 'cancelado');
      }
    } catch (error) {
      console.error('Error al cancelar pago:', error);
      throw error;
    }
  }

  // Obtener historial de pagos del usuario
  static async getUserPayments(userId: string): Promise<Payment[]> {
    try {
      const snapshot = await db.collection('payments')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Payment[];
    } catch (error) {
      console.error('Error al obtener historial de pagos:', error);
      throw error;
    }
  }

  // Procesar webhook de Stripe
  static async handleStripeWebhook(event: any): Promise<void> {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          
          // Actualizar el pago en Firestore
          const paymentQuery = await db.collection('payments')
            .where('paymentIntentId', '==', paymentIntent.id)
            .limit(1)
            .get();

          if (!paymentQuery.empty && paymentQuery.docs[0]) {
            const paymentDoc = paymentQuery.docs[0];
            const paymentData = paymentDoc.data();

            await paymentDoc.ref.update({
              status: 'succeeded',
              updatedAt: new Date(),
            });

            // Actualizar la reserva a pagado
            await BookingService.updateBookingStatus(paymentData.bookingId, 'pagado', paymentIntent.id);

            console.log(`✅ Pago exitoso para reserva ${paymentData.bookingId}`);
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          
          const paymentQuery = await db.collection('payments')
            .where('paymentIntentId', '==', paymentIntent.id)
            .limit(1)
            .get();

          if (!paymentQuery.empty && paymentQuery.docs[0]) {
            const paymentDoc = paymentQuery.docs[0];
            await paymentDoc.ref.update({
              status: 'failed',
              errorMessage: paymentIntent.last_payment_error?.message || 'Pago fallido',
              updatedAt: new Date(),
            });

            console.error(`❌ Pago fallido: ${paymentIntent.id}`);
          }
          break;
        }

        default:
          console.log(`⚠️ Evento no manejado: ${event.type}`);
      }
    } catch (error) {
      console.error('Error procesando webhook de Stripe:', error);
      throw error;
    }
  }
}
