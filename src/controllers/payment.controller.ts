import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import * as WalletService from '../services/wallet.service';

// Crear Payment Intent para una reserva
export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { bookingId, userId, amount, currency, paymentMethodId, saveCard } = req.body;

    if (!bookingId || !userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'bookingId, userId y amount son requeridos',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser mayor a 0',
      });
    }

    const result = await PaymentService.createPaymentIntent({
      bookingId,
      userId,
      amount,
      currency,
      paymentMethodId,
      saveCard,
    });

    res.status(201).json({
      success: true,
      message: 'Payment Intent creado exitosamente',
      ...result,
    });
  } catch (error: any) {
    console.error('Error al crear Payment Intent:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al crear Payment Intent',
    });
  }
};

// Confirmar pago con tarjeta guardada
export const confirmPaymentWithSavedCard = async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, paymentMethodId, userId } = req.body;

    if (!paymentIntentId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: 'paymentIntentId y paymentMethodId son requeridos',
      });
    }

    // Verificar que el payment method pertenece al usuario
    const cards = await WalletService.getUserCards(userId);
    const cardExists = cards.find(card => card.stripePaymentMethodId === paymentMethodId);

    if (!cardExists) {
      return res.status(403).json({
        success: false,
        message: 'Esta tarjeta no pertenece a tu billetera',
      });
    }

    const result = await PaymentService.confirmPaymentWithSavedCard({
      paymentIntentId,
      paymentMethodId,
    });

    res.status(200).json({
      ...result,
      message: result.success ? 'Pago confirmado exitosamente' : 'Error al confirmar pago',
    });
  } catch (error: any) {
    console.error('Error al confirmar pago:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al confirmar pago',
    });
  }
};

// Obtener estado del pago
export const getPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId || Array.isArray(paymentIntentId)) {
      return res.status(400).json({
        success: false,
        message: 'paymentIntentId es requerido',
      });
    }

    const result = await PaymentService.getPaymentStatus(paymentIntentId);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error al obtener estado del pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estado del pago',
      error: error.message,
    });
  }
};

// Cancelar pago
export const cancelPayment = async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;
    const { userId } = req.body;

    if (!paymentIntentId || Array.isArray(paymentIntentId) || !userId) {
      return res.status(400).json({
        success: false,
        message: 'paymentIntentId y userId son requeridos',
      });
    }

    await PaymentService.cancelPayment(paymentIntentId, userId);

    res.status(200).json({
      success: true,
      message: 'Pago cancelado exitosamente',
    });
  } catch (error: any) {
    console.error('Error al cancelar pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar pago',
      error: error.message,
    });
  }
};

// Obtener historial de pagos del usuario
export const getUserPayments = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        message: 'userId es requerido',
      });
    }

    const payments = await PaymentService.getUserPayments(userId);

    res.status(200).json({
      success: true,
      payments,
      total: payments.length,
    });
  } catch (error: any) {
    console.error('Error al obtener historial de pagos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial de pagos',
      error: error.message,
    });
  }
};

// Webhook de Stripe
export const handleStripeWebhook = async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      return res.status(400).json({
        success: false,
        message: 'Falta signature de Stripe',
      });
    }

    // Aquí deberías verificar la firma del webhook
    // const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    
    const event = req.body;

    await PaymentService.handleStripeWebhook(event);

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error en webhook de Stripe:', error);
    res.status(400).json({
      success: false,
      message: 'Error procesando webhook',
      error: error.message,
    });
  }
};
