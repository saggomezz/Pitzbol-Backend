import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY no está definida");
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
console.log("Stripe key cargada:", process.env.STRIPE_SECRET_KEY?.slice(0, 10));

export default stripe;
