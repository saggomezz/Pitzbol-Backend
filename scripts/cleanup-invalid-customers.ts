import dotenv from "dotenv"; dotenv.config();
import { db } from "../src/config/firebase";
import stripe from "../src/config/stripe";

(async () => {
  const snap = await db.collection("wallets").get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const cid: string | undefined = doc.data().stripeCustomerId;
    if (!cid) continue;
    try {
      await stripe.customers.retrieve(cid);
      console.log("  ✅ válido:", cid, "(uid:", doc.id, ")");
    } catch {
      console.log("  ❌ inválido:", cid, "(uid:", doc.id, ") → limpiando...");
      await doc.ref.update({ stripeCustomerId: null });
      fixed++;
    }
  }
  console.log(`\nListo: ${fixed} customer(s) inválido(s) limpiados.`);
  process.exit(0);
})();
