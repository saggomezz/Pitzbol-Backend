import express from "express";
import stripe from "../config/stripe.js";

const router = express.Router();

router.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount } = req.body; // en centavos

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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/create-connect-account", async (req, res) => {
  try {
    const { email, uid } = req.body;

    const account = await stripe.accounts.create({
      type: "express",
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { firebaseUID: uid }
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "http://localhost:3000/perfil?stripe=retry",
      return_url: "http://localhost:3000/perfil?stripe=success",
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url, stripeAccountId: account.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
