import { Router, Request, Response } from "express";
import stripe from "../config/stripe";
import { db } from '../config/firebase';

const router = Router();

router.post(
  "/create-payment-intent",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount, currency = "mxn", customerId, paymentMethodId, bookingId } = req.body as { 
        amount: number; 
        currency?: string;
        customerId?: string;
        paymentMethodId?: string;
        bookingId?: string;
      };

      if (!amount || amount <= 0) {
        res.status(400).json({ 
          success: false,
          error: "Monto inválido" 
        });
        return;
      }

      // Si se proporciona un paymentMethodId, usarlo directamente
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
        // Crear payment intent normal
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          automatic_payment_methods: {
            enabled: true,
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

// Obtener tarjetas guardadas del usuario
router.get(
  "/cards/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Obtener tarjetas guardadas de Firebase
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

// Guardar tarjeta del usuario
router.post(
  "/cards/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { paymentMethodId } = req.body;

      if (!paymentMethodId) {
        res.status(400).json({ 
          success: false,
          error: "paymentMethodId es requerido" 
        });
        return;
      }

      // Obtener detalles del payment method de Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      const cardData = {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand || '',
        last4: paymentMethod.card?.last4 || '',
        exp_month: paymentMethod.card?.exp_month || 0,
        exp_year: paymentMethod.card?.exp_year || 0,
        createdAt: new Date().toISOString(),
      };

      // Guardar en Firebase
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

