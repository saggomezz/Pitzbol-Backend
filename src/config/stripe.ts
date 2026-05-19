import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY no está definida");
}

const stripe: InstanceType<typeof Stripe> = new Stripe(STRIPE_SECRET_KEY);

console.log(
  "Stripe conectado:",
);

export default stripe;
