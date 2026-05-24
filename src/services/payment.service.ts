import stripe from '../config/stripe';
import { db } from '../config/firebase';
import { Payment, CreatePaymentRequest, ConfirmPaymentRequest } from '../models/wallet.model';
import { BookingService } from './booking.service';
import * as WalletService from './wallet.service';
import { sendPaymentReceiptEmail } from './email.service';
import { sendNotificationToUser } from './notification.service';

type PaymentRecord = {
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentIntentId: string;
  receiptEmailSentAt?: Date;
  receiptEmailProcessing?: boolean;
  paymentMethodId?: string;
};

const buildFullName = (userData: Record<string, any>) => {
  const firstName = userData?.['01_nombre'] || userData?.nombre || '';
  const lastName = userData?.['02_apellido'] || userData?.apellido || '';
  return `${firstName} ${lastName}`.trim();
};

const buildEmail = (userData: Record<string, any>) =>
  userData?.['04_correo'] || userData?.email || userData?.correo || '';

export class PaymentService {
  private static async getUserContact(uid: string): Promise<{ email: string; name: string }> {
    const collections = [
      db.collection('usuarios').doc('turistas').collection('lista'),
      db.collection('usuarios').doc('guias').collection('lista'),
    ];

    for (const collection of collections) {
      const snapshot = await collection.where('uid', '==', uid).limit(1).get();
      if (!snapshot.empty && snapshot.docs[0]) {
        const userData = snapshot.docs[0].data();
        return {
          email: buildEmail(userData),
          name: buildFullName(userData),
        };
      }
    }

    return { email: '', name: '' };
  }

  private static async markReceiptDispatchStarted(paymentRef: FirebaseFirestore.DocumentReference): Promise<boolean> {
    return db.runTransaction(async transaction => {
      const currentSnapshot = await transaction.get(paymentRef);
      const paymentData = currentSnapshot.data() as PaymentRecord | undefined;

      if (!paymentData || paymentData.receiptEmailSentAt || paymentData.receiptEmailProcessing) {
        return false;
      }

      transaction.update(paymentRef, {
        receiptEmailProcessing: true,
        receiptEmailLastAttemptAt: new Date(),
        updatedAt: new Date(),
      });

      return true;
    });
  }

  private static async sendReceiptForPayment(paymentDoc: FirebaseFirestore.QueryDocumentSnapshot, paymentData: PaymentRecord, paymentIntentId: string): Promise<void> {
    const canSendReceipt = await this.markReceiptDispatchStarted(paymentDoc.ref);
    if (!canSendReceipt) {
      return;
    }

    try {
      const booking = await BookingService.getBookingById(paymentData.bookingId);
      if (!booking) {
        throw new Error('Reserva no encontrada para generar recibo');
      }

      const touristContact = await this.getUserContact(paymentData.userId || booking.touristId);
      if (!touristContact.email) {
        throw new Error('No se encontró correo del turista para enviar el recibo');
      }

      let cardBrand = 'Tarjeta';
      const pmId = paymentData.paymentMethodId;
      if (pmId) {
        try {
          const pm = await stripe.paymentMethods.retrieve(pmId);
          if (pm.card?.brand) {
            const raw = pm.card.brand;
            cardBrand = raw.charAt(0).toUpperCase() + raw.slice(1);
          }
        } catch {
          // fallback to generic label
        }
      }

      await sendPaymentReceiptEmail({
        to: touristContact.email,
        touristName: booking.touristName || touristContact.name || 'Turista',
        guideName: booking.guideName || 'Guía',
        bookingId: booking.id,
        cardBrand,
        fecha: booking.fecha,
        horaInicio: booking.horaInicio,
        duracion: booking.duracion,
        numPersonas: booking.numPersonas,
        total: booking.total,
        issuedAt: new Date(),
      });

      await paymentDoc.ref.update({
        receiptEmailProcessing: false,
        receiptEmailSentAt: new Date(),
        receiptEmail: touristContact.email,
        updatedAt: new Date(),
      });
    } catch (error: any) {
      console.error(`Error al enviar recibo para pago ${paymentIntentId}:`, error);
      await paymentDoc.ref.update({
        receiptEmailProcessing: false,
        receiptEmailLastError: error?.message || 'Error al enviar el recibo',
        updatedAt: new Date(),
      });
    }
  }

  private static async finalizeSuccessfulPayment(
    paymentDoc: FirebaseFirestore.QueryDocumentSnapshot,
    paymentData: PaymentRecord,
    paymentIntentId: string,
    extraUpdates: Record<string, unknown> = {}
  ): Promise<void> {
    await paymentDoc.ref.update({
      status: 'succeeded',
      updatedAt: new Date(),
      ...extraUpdates,
    });

    await BookingService.updateBookingStatus(paymentData.bookingId, 'pagado', paymentIntentId);
    await this.sendReceiptForPayment(paymentDoc, paymentData, paymentIntentId);

    // Notificar al turista que el pago fue procesado exitosamente
    try {
      const booking = await BookingService.getBookingById(paymentData.bookingId);
      if (booking) {
        const fechaFormateada = new Date(booking.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        await sendNotificationToUser(paymentData.userId, {
          tipo: 'pago_confirmado',
          titulo: '¡Pago confirmado!',
          mensaje: `Tu pago para el tour con ${booking.guideName} el ${fechaFormateada} fue procesado con éxito. ¡Nos vemos pronto!`,
          fecha: new Date().toISOString(),
          leido: false,
          enlace: '/perfil',
          bookingId: paymentData.bookingId,
        });
      }
    } catch (notifErr) {
      console.warn('⚠️ Error al enviar notificación de pago confirmado:', notifErr);
    }
  }

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

      // Obtener el customer de Stripe del usuario (y validar que sigue existiendo)
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await walletRef.get();
      let stripeCustomerId: string | undefined;

      if (walletDoc.exists && walletDoc.data()?.stripeCustomerId) {
        const candidateId: string = walletDoc.data()!.stripeCustomerId;
        try {
          await stripe.customers.retrieve(candidateId);
          stripeCustomerId = candidateId;
        } catch {
          // Customer ya no existe en Stripe — limpiar Firestore y crear uno nuevo
          const newCustomer = await stripe.customers.create({ metadata: { uid: userId } });
          stripeCustomerId = newCustomer.id;
          await walletRef.update({ stripeCustomerId });
        }
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

      // Usar automatic_payment_methods con allow_redirects:'never' en todos los casos
      // para bloquear métodos con redirección (iDEAL, Bancontact, etc.)
      paymentIntentData.automatic_payment_methods = {
        enabled: true,
        allow_redirects: 'never',
      };
      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      // Guardar el pago en Firestore
      await db.collection('payments').add({
        bookingId,
        userId,
        guideId: booking.guideId || null,
        guideName: booking.guideName || null,
        touristName: booking.touristName || null,
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
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('No such PaymentMethod')) {
        const customError: any = new Error('La tarjeta guardada ya no es válida en Stripe. Por favor elimínala y agrégala de nuevo.');
        customError.code = 'INVALID_PAYMENT_METHOD';
        throw customError;
      }
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
      // off_session: true indica que el cliente no está presente (tarjeta guardada)
      // return_url necesario si Stripe lo exige aunque no se use
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
        off_session: true,
        return_url: process.env.FRONTEND_URL || 'https://www.pitzbol.me',
      } as any);

      // Actualizar el estado del pago en Firestore
      const paymentQuery = await db.collection('payments')
        .where('paymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (!paymentQuery.empty && paymentQuery.docs[0]) {
        const paymentDoc = paymentQuery.docs[0];
        const paymentData = paymentDoc.data() as PaymentRecord;

        // Si el pago es exitoso, actualizar la reserva
        if (paymentIntent.status === 'succeeded') {
          await this.finalizeSuccessfulPayment(paymentDoc, paymentData, paymentIntentId, {
            paymentMethodId,
          });
        } else {
          await paymentDoc.ref.update({
            status: paymentIntent.status,
            paymentMethodId,
            updatedAt: new Date(),
          });
        }
      }

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('No such PaymentMethod')) {
        const customError: any = new Error('La tarjeta guardada ya no es válida en Stripe. Por favor elimínala y agrégala de nuevo.');
        customError.code = 'INVALID_PAYMENT_METHOD';
        throw customError;
      }
      console.error('Error al confirmar pago:', error);
      throw error;
    }
  }

  static async finalizePaymentIntent(paymentIntentId: string, userId: string): Promise<{
    success: boolean;
    paymentIntentId: string;
    status: string;
  }> {
    try {
      const paymentQuery = await db.collection('payments')
        .where('paymentIntentId', '==', paymentIntentId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (paymentQuery.empty || !paymentQuery.docs[0]) {
        throw new Error('Pago no encontrado o no autorizado');
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const paymentDoc = paymentQuery.docs[0];
      const paymentData = paymentDoc.data() as PaymentRecord;

      if (paymentIntent.status === 'succeeded') {
        await this.finalizeSuccessfulPayment(paymentDoc, paymentData, paymentIntent.id, {
          paymentMethodId:
            typeof paymentIntent.payment_method === 'string'
              ? paymentIntent.payment_method
              : paymentData.paymentMethodId || '',
        });
      } else {
        await paymentDoc.ref.update({
          status: paymentIntent.status,
          updatedAt: new Date(),
        });
      }

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      console.error('Error al finalizar Payment Intent:', error);
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

  // Reembolsar y cancelar una reserva pagada (iniciado por el guía)
  static async refundForBooking(bookingId: string): Promise<void> {
    const paymentQuery = await db.collection('payments')
      .where('bookingId', '==', bookingId)
      .limit(1)
      .get();

    if (paymentQuery.empty) {
      // No payment found — just cancel the booking without refund
      await BookingService.cancelBooking(bookingId);
      return;
    }

    const paymentDoc = paymentQuery.docs[0]!;
    const paymentData = paymentDoc.data() as PaymentRecord;

    // Issue Stripe refund
    await stripe.refunds.create({ payment_intent: paymentData.paymentIntentId });

    // Update payment doc
    await paymentDoc.ref.update({ status: 'refunded', updatedAt: new Date() });

    // Cancel the booking (updates status + availability)
    await BookingService.cancelBooking(bookingId);
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

  // Obtener pagos recibidos por un guía (ingresos)
  static async getGuideReceivedPayments(guideId: string): Promise<Payment[]> {
    try {
      // Primary path: documentos con guideId persistido
      const direct = await db.collection('payments')
        .where('guideId', '==', guideId)
        .get();

      const results: Payment[] = direct.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Payment[];

      // Fallback: pagos antiguos sin guideId — resolver vía booking
      const seenIds = new Set(results.map(p => p.id));
      const orphaned = await db.collection('payments').get();
      const orphanDocs = orphaned.docs.filter(d => !seenIds.has(d.id) && !(d.data() as any).guideId);

      for (const doc of orphanDocs) {
        const data = doc.data() as any;
        if (!data?.bookingId) continue;
        try {
          const booking = await BookingService.getBookingById(data.bookingId);
          if (booking?.guideId === guideId) {
            results.push({ id: doc.id, ...data } as Payment);
          }
        } catch {
          // ignorar errores puntuales por reserva no encontrada
        }
      }

      // Ordenar por createdAt desc
      results.sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis?.() ?? new Date(a.createdAt ?? 0).getTime();
        const tb = b.createdAt?.toMillis?.() ?? new Date(b.createdAt ?? 0).getTime();
        return tb - ta;
      });

      return results;
    } catch (error) {
      console.error('Error al obtener pagos recibidos del guía:', error);
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
            const paymentData = paymentDoc.data() as PaymentRecord;

            await this.finalizeSuccessfulPayment(paymentDoc, paymentData, paymentIntent.id);

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
