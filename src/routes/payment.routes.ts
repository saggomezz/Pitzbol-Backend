import { Router, Request, Response } from "express";
import stripe from "../config/stripe";

const router = Router();

router.post(
  "/create-payment-intent",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { amount } = req.body as { amount: number };

      if (!amount || amount <= 0) {
        res.status(400).json({ error: "Monto inválido" });
        return;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "mxn",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Error desconocido" });
      }
    }
  }
);

export default router;
