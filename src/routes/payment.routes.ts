import { Router, Request, Response } from "express";
import stripe from "../config/stripe";
import { db } from '../config/firebase';
import {
  createPaymentIntent,
  confirmPaymentWithSavedCard,
  finalizePaymentIntent,
  getPaymentStatus,
  cancelPayment,
  getUserPayments,
  handleStripeWebhook,
} from '../controllers/payment.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Crear Payment Intent
router.post('/create-payment-intent', authMiddleware, createPaymentIntent);

// Confirmar pago con tarjeta guardada
router.post('/confirm-with-saved-card', authMiddleware, confirmPaymentWithSavedCard);

// Finalizar pago confirmado en frontend
router.post('/finalize-payment-intent', authMiddleware, finalizePaymentIntent);

// Obtener estado del pago
router.get('/status/:paymentIntentId', authMiddleware, getPaymentStatus);

// Cancelar pago
router.post('/cancel/:paymentIntentId', authMiddleware, cancelPayment);

// Obtener historial de pagos del usuario
router.get('/history/:userId', authMiddleware, getUserPayments);

// Webhook de Stripe (no requiere autenticacion - uses signature verification)
router.post('/webhook', handleStripeWebhook);

// ENDPOINT SIMPLE para pagos (requiere autenticación)
router.post(
  "/create-simple-payment",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount, currency = "mxn", customerId, paymentMethodId, bookingId } = req.body as {
        amount: number;
        currency?: string;
        customerId?: string;
        paymentMethodId?: string;
        bookingId?: string;
      };

      if (!amount || amount <= 0 || amount > 1000000) {
        res.status(400).json({
          success: false,
          error: "Monto inválido (debe ser entre 1 y 1,000,000)"
        });
        return;
      }

      if (paymentMethodId) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          payment_method: paymentMethodId,
          confirm: true,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never'
          },
          metadata: {
            bookingId: bookingId || '',
            customerId: customerId || '',
          }
        });

        res.json({
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
          metadata: {
            bookingId: bookingId || '',
            customerId: customerId || '',
          }
        });

        res.json({
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Error desconocido"
        });
      }
    }
  }
);

router.get(
  "/cards/:userId",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = typeof req.params.userId === 'string' ? req.params.userId : '';
      if (!userId) {
        res.status(400).json({ success: false, error: 'userId es requerido' });
        return;
      }

      // IDOR protection
      if ((req as any).user?.uid !== userId) {
        res.status(403).json({ success: false, error: 'No autorizado' });
        return;
      }

      const walletDoc = await db.collection('wallets').doc(userId).get();

      if (!walletDoc.exists) {
        res.json({
          success: true,
          cards: []
        });
        return;
      }

      const walletData = walletDoc.data();
      const cards = walletData?.cards || [];

      res.json({
        success: true,
        cards
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Error desconocido"
        });
      }
    }
  }
);

router.post(
  "/cards/:userId",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = typeof req.params.userId === 'string' ? req.params.userId : '';
      if (!userId) {
        res.status(400).json({ success: false, error: 'userId es requerido' });
        return;
      }
      const { paymentMethodId } = req.body;

      // IDOR protection
      if ((req as any).user?.uid !== userId) {
        res.status(403).json({ success: false, error: 'No autorizado' });
        return;
      }

      if (!paymentMethodId) {
        res.status(400).json({
          success: false,
          error: "paymentMethodId es requerido"
        });
        return;
      }

      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      const cardData = {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand || '',
        last4: paymentMethod.card?.last4 || '',
        exp_month: paymentMethod.card?.exp_month || 0,
        exp_year: paymentMethod.card?.exp_year || 0,
        createdAt: new Date().toISOString(),
      };

      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await walletRef.get();

      if (walletDoc.exists) {
        await walletRef.update({
          cards: [...(walletDoc.data()?.cards || []), cardData],
          updatedAt: new Date().toISOString(),
        });
      } else {
        await walletRef.set({
          userId,
          cards: [cardData],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        card: cardData,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Error desconocido"
        });
      }
    }
  }
);

export default router;