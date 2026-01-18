import { db } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";

export interface UserCard {
  id: string;
  uid: string;
  stripePaymentMethodId: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const CARDS_COLLECTION = "userCards";

/**
 * Guardar una tarjeta en Firestore
 */
export async function saveCard(
  uid: string,
  cardData: {
    stripePaymentMethodId: string;
    last4: string;
    brand: string;
    expMonth: number;
    expYear: number;
  }
): Promise<UserCard> {
  try {
    console.log(`💾 [saveCard] Iniciando guardar tarjeta...`);
    console.log(`   - UID: ${uid}`);
    console.log(`   - Stripe Payment Method ID: ${cardData.stripePaymentMethodId}`);
    console.log(`   - Last4: ${cardData.last4}`);
    console.log(`   - Brand: ${cardData.brand}`);

    if (!uid) {
      throw new Error("UID es requerido para guardar una tarjeta");
    }

    const cardsRef = db.collection(CARDS_COLLECTION);
    
    // Si es la primera tarjeta, hacerla predeterminada
    const existingCards = await cardsRef.where("uid", "==", uid).where("isActive", "==", true).get();
    const isDefault = existingCards.empty;

    console.log(`   - Tarjetas existentes: ${existingCards.size}`);
    console.log(`   - Se establecerá como predeterminada: ${isDefault}`);

    const newCardRef = cardsRef.doc();
    const now = Timestamp.now();

    const newCard: UserCard = {
      id: newCardRef.id,
      uid,
      stripePaymentMethodId: cardData.stripePaymentMethodId,
      last4: cardData.last4,
      brand: cardData.brand,
      expMonth: cardData.expMonth,
      expYear: cardData.expYear,
      isDefault,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    console.log(`   - Datos de tarjeta a guardar:`, newCard);

    await newCardRef.set(newCard);
    
    console.log(`✅ [saveCard] Tarjeta guardada exitosamente`);
    console.log(`   - ID de tarjeta en Firestore: ${newCard.id}`);
    console.log(`   - Collection: ${CARDS_COLLECTION}`);
    
    return newCard;
  } catch (error) {
    console.error("❌ [saveCard] Error guardando tarjeta:", error);
    throw error;
  }
}

/**
 * Obtener todas las tarjetas activas del usuario
 */
export async function getUserCards(uid: string): Promise<UserCard[]> {
  try {
    console.log(`📋 [getUserCards] Obteniendo tarjetas...`);
    console.log(`   - UID: ${uid}`);

    if (!uid) {
      throw new Error("UID es requerido para obtener tarjetas");
    }

    const cardsRef = db.collection(CARDS_COLLECTION);
    
    console.log(`   - Colección: ${CARDS_COLLECTION}`);
    console.log(`   - Buscando: uid == '${uid}' AND isActive == true`);

    // Consulta simple sin orderBy para evitar necesitar índices
    const snapshot = await cardsRef
      .where("uid", "==", uid)
      .where("isActive", "==", true)
      .get();

    const cards: UserCard[] = [];
    snapshot.forEach((doc) => {
      cards.push(doc.data() as UserCard);
    });

    // Ordenamos en memoria: primero las predeterminadas, luego por fecha
    cards.sort((a, b) => {
      // Primero por isDefault (true antes que false)
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      // Luego por createdAt (más reciente primero)
      const timeA = a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });

    console.log(`✅ [getUserCards] ${cards.length} tarjeta(s) encontrada(s)`);
    cards.forEach((card, index) => {
      console.log(`   [${index + 1}] ID: ${card.id}, Last4: ${card.last4}, Default: ${card.isDefault}`);
    });

    return cards;
  } catch (error) {
    console.error("❌ [getUserCards] Error obteniendo tarjetas:", error);
    throw error;
  }
}

/**
 * Eliminar una tarjeta (soft delete)
 */
export async function deleteCard(uid: string, cardId: string): Promise<void> {
  try {
    const cardRef = db.collection(CARDS_COLLECTION).doc(cardId);
    const card = await cardRef.get();

    if (!card.exists) {
      throw new Error("Tarjeta no encontrada");
    }

    const cardData = card.data() as UserCard;
    if (cardData.uid !== uid) {
      throw new Error("No tienes permiso para eliminar esta tarjeta");
    }

    // Soft delete
    await cardRef.update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Tarjeta eliminada: ${cardId}`);
  } catch (error) {
    console.error("❌ Error eliminando tarjeta:", error);
    throw error;
  }
}

/**
 * Establecer tarjeta como predeterminada
 */
export async function setDefaultCard(uid: string, cardId: string): Promise<void> {
  try {
    const cardsRef = db.collection(CARDS_COLLECTION);
    const cardRef = cardsRef.doc(cardId);
    const card = await cardRef.get();

    if (!card.exists) {
      throw new Error("Tarjeta no encontrada");
    }

    const cardData = card.data() as UserCard;
    if (cardData.uid !== uid) {
      throw new Error("No tienes permiso para modificar esta tarjeta");
    }

    // Desmarcar la tarjeta predeterminada actual
    const currentDefault = await cardsRef
      .where("uid", "==", uid)
      .where("isDefault", "==", true)
      .where("isActive", "==", true)
      .get();

    const batch = db.batch();

    currentDefault.forEach((doc) => {
      batch.update(doc.ref, { 
        isDefault: false, 
        updatedAt: Timestamp.now() 
      });
    });

    // Marcar la nueva como predeterminada
    batch.update(cardRef, { 
      isDefault: true, 
      updatedAt: Timestamp.now() 
    });

    await batch.commit();
    console.log(`✅ Tarjeta establecida como predeterminada: ${cardId}`);
  } catch (error) {
    console.error("❌ Error estableciendo tarjeta predeterminada:", error);
    throw error;
  }
}

/**
 * Obtener tarjeta predeterminada del usuario
 */
export async function getDefaultCard(uid: string): Promise<UserCard | null> {
  try {
    const snapshot = await db
      .collection(CARDS_COLLECTION)
      .where("uid", "==", uid)
      .where("isDefault", "==", true)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0]!.data() as UserCard;
  } catch (error) {
    console.error("❌ Error obteniendo tarjeta predeterminada:", error);
    throw error;
  }
}
