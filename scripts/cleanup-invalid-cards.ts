/**
 * Elimina tarjetas guardadas en Firestore cuyo pm_ ya no existe en Stripe.
 * Uso: npx tsx scripts/cleanup-invalid-cards.ts [uid_opcional]
 * Sin uid: revisa TODAS las tarjetas de todos los usuarios.
 */
import dotenv from "dotenv";
dotenv.config();
import { db } from "../src/config/firebase";
import stripe from "../src/config/stripe";

const targetUid = process.argv[2] || null;

async function run() {
  const cardsRef = db.collection("userCards");
  let query: FirebaseFirestore.Query = cardsRef.where("isActive", "==", true);
  if (targetUid) query = query.where("uid", "==", targetUid);

  const snap = await query.get();
  console.log(`Revisando ${snap.size} tarjeta(s)...`);

  let removed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const pmId: string = data.stripePaymentMethodId;
    try {
      await stripe.paymentMethods.retrieve(pmId);
      console.log(`  ✅ válida:   ${pmId} (uid: ${data.uid})`);
    } catch (err: any) {
      if (
        err?.code === "resource_missing" ||
        (typeof err?.message === "string" && err.message.includes("No such PaymentMethod"))
      ) {
        console.log(`  ❌ inválida: ${pmId} (uid: ${data.uid}) → eliminando...`);
        await doc.ref.update({ isActive: false, deletedAt: new Date() });
        removed++;
      } else {
        console.warn(`  ⚠️  error inesperado para ${pmId}:`, err?.message);
      }
    }
  }

  console.log(`\nListo. ${removed} tarjeta(s) inválida(s) desactivadas.`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
