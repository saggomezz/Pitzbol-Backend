# 💾 Guía de Base de Datos - Sistema de Billetera

## Estructura de datos

### Colección: `userCards`

```typescript
interface UserCard {
  // Identificadores
  id: string;                      // ID único (ejemplo: "card_12345")
  uid: string;                     // UID del usuario de Firebase
  stripePaymentMethodId: string;   // ID del payment method en Stripe
  
  // Información de la tarjeta
  last4: string;                   // Últimos 4 dígitos
  brand: string;                   // "visa" | "mastercard" | "amex"
  expMonth: number;                // 1-12
  expYear: number;                 // 2025, 2026, etc
  
  // Estado
  isDefault: boolean;              // ¿Es la tarjeta predeterminada?
  isActive: boolean;               // ¿Está activa? (para soft delete)
  
  // Auditoría
  createdAt: Date | Timestamp;     // Fecha de creación
  updatedAt: Date | Timestamp;     // Última actualización
  deletedAt?: Date | Timestamp;    // Fecha de eliminación (si aplica)
  
  // Metadata
  billingName?: string;            // Nombre del titular (opcional)
  billingEmail?: string;           // Email del titular (opcional)
}
```

---

## Ejemplos de implementación

### 1. Firestore (Firebase)

#### Crear la colección
```typescript
// src/config/firebaseDB.ts
import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, query, where, getDocs } from "firebase/firestore";

const userCardsRef = collection(db, "userCards");

// Guardar tarjeta
export async function saveCard(uid: string, cardData: Partial<UserCard>) {
  const cardDoc = doc(userCardsRef);
  const newCard: UserCard = {
    id: cardDoc.id,
    uid,
    stripePaymentMethodId: cardData.stripePaymentMethodId!,
    last4: cardData.last4!,
    brand: cardData.brand!,
    expMonth: cardData.expMonth!,
    expYear: cardData.expYear!,
    isDefault: cardData.isDefault || false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  await setDoc(cardDoc, newCard);
  return newCard;
}

// Obtener tarjetas del usuario
export async function getUserCards(uid: string) {
  const q = query(userCardsRef, where("uid", "==", uid), where("isActive", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as UserCard);
}

// Eliminar tarjeta (soft delete)
export async function deleteCard(uid: string, cardId: string) {
  const cardDoc = doc(userCardsRef, cardId);
  const card = await getDoc(cardDoc);
  
  if (!card.exists() || card.data().uid !== uid) {
    throw new Error("Tarjeta no encontrada");
  }
  
  await setDoc(cardDoc, {
    ...card.data(),
    isActive: false,
    deletedAt: new Date(),
    updatedAt: new Date()
  }, { merge: true });
}

// Establecer como predeterminada
export async function setDefaultCard(uid: string, cardId: string) {
  // Primero, desmarcar la tarjeta predeterminada actual
  const q = query(userCardsRef, where("uid", "==", uid), where("isDefault", "==", true));
  const snapshot = await getDocs(q);
  
  snapshot.docs.forEach(async (doc) => {
    await setDoc(doc.ref, { isDefault: false, updatedAt: new Date() }, { merge: true });
  });
  
  // Marcar nueva como predeterminada
  const cardDoc = doc(userCardsRef, cardId);
  await setDoc(cardDoc, {
    isDefault: true,
    updatedAt: new Date()
  }, { merge: true });
}
```

---

### 2. MongoDB

#### Schema de Mongoose
```typescript
// src/models/UserCard.ts
import mongoose from "mongoose";

const userCardSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    index: true
  },
  stripePaymentMethodId: {
    type: String,
    required: true,
    unique: true
  },
  last4: {
    type: String,
    required: true
  },
  brand: {
    type: String,
    enum: ["visa", "mastercard", "amex"],
    required: true
  },
  expMonth: {
    type: Number,
    required: true
  },
  expYear: {
    type: Number,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  billingName: String,
  billingEmail: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  deletedAt: Date
});

// Índice compuesto para queries rápidas
userCardSchema.index({ uid: 1, isActive: 1 });
userCardSchema.index({ uid: 1, isDefault: 1 });

export const UserCard = mongoose.model("UserCard", userCardSchema);

// Métodos útiles
export async function getUserCards(uid: string) {
  return UserCard.find({ uid, isActive: true }).sort({ isDefault: -1 });
}

export async function saveCard(uid: string, cardData: any) {
  const newCard = new UserCard({
    ...cardData,
    uid,
    isDefault: false,
    isActive: true
  });
  return newCard.save();
}

export async function setDefaultCard(uid: string, cardId: string) {
  // Desmarcar actual predeterminada
  await UserCard.updateMany(
    { uid, isDefault: true },
    { isDefault: false, updatedAt: new Date() }
  );
  
  // Marcar nueva
  return UserCard.findByIdAndUpdate(
    cardId,
    { isDefault: true, updatedAt: new Date() },
    { new: true }
  );
}

export async function deleteCard(uid: string, cardId: string) {
  return UserCard.findByIdAndUpdate(
    cardId,
    { isActive: false, deletedAt: new Date(), updatedAt: new Date() },
    { new: true }
  );
}
```

---

### 3. Actualizar Controlador de Perfil

```typescript
// src/controllers/perfil.controller.ts
import { Request, Response } from "express";
import stripe from "../config/stripe";
// Importar según tu BD:
// import { saveCard, getUserCards, setDefaultCard, deleteCard } from "../config/firebaseDB";
// O si usas MongoDB:
import { UserCard, saveCard, getUserCards, setDefaultCard, deleteCard } from "../models/UserCard";

// GET /api/perfil/wallet
export async function obtenerTarjetas(req: Request, res: Response) {
  try {
    const uid = (req as any).uid;
    
    if (!uid) {
      return res.status(401).json({ error: "No autorizado" });
    }
    
    const cards = await getUserCards(uid);
    
    // Formatear respuesta
    const formattedCards = cards.map(card => ({
      id: card.id,
      last4: card.last4,
      brand: card.brand,
      expMonth: card.expMonth,
      expYear: card.expYear,
      isDefault: card.isDefault
    }));
    
    res.json({ cards: formattedCards });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/perfil/save-card
export async function guardarTarjeta(req: Request, res: Response) {
  try {
    const uid = (req as any).uid;
    const { paymentMethodId } = req.body;
    
    if (!uid || !paymentMethodId) {
      return res.status(400).json({ error: "Datos incompletos" });
    }
    
    // Obtener detalles del payment method de Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (!paymentMethod.card) {
      return res.status(400).json({ error: "Payment method inválido" });
    }
    
    const card = paymentMethod.card;
    
    // Guardar en BD
    const newCard = await saveCard(uid, {
      stripePaymentMethodId: paymentMethodId,
      last4: card.last4 || "",
      brand: card.brand || "unknown",
      expMonth: card.exp_month || 0,
      expYear: card.exp_year || 0,
      isDefault: false
    });
    
    res.json({
      success: true,
      message: "Tarjeta guardada exitosamente",
      card: {
        id: newCard.id,
        last4: newCard.last4,
        brand: newCard.brand,
        expMonth: newCard.expMonth,
        expYear: newCard.expYear
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// DELETE /api/perfil/card/:cardId
export async function eliminarTarjeta(req: Request, res: Response) {
  try {
    const uid = (req as any).uid;
    const { cardId } = req.params;
    
    if (!uid) {
      return res.status(401).json({ error: "No autorizado" });
    }
    
    // Eliminar de BD
    await deleteCard(uid, cardId);
    
    // Opcional: Desvincularse de Stripe
    // const card = await UserCard.findById(cardId);
    // if (card) {
    //   await stripe.paymentMethods.detach(card.stripePaymentMethodId);
    // }
    
    res.json({
      success: true,
      message: "Tarjeta eliminada"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/perfil/card/:cardId/default
export async function establecerPredeterminada(req: Request, res: Response) {
  try {
    const uid = (req as any).uid;
    const { cardId } = req.params;
    
    if (!uid) {
      return res.status(401).json({ error: "No autorizado" });
    }
    
    // Actualizar en BD
    await setDefaultCard(uid, cardId);
    
    res.json({
      success: true,
      message: "Tarjeta establecida como predeterminada"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
```

---

### 4. Actualizar Rutas

```typescript
// src/routes/perfil.routes.ts
import express from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { 
  obtenerTarjetas,
  guardarTarjeta,
  eliminarTarjeta,
  establecerPredeterminada 
} from "../controllers/perfil.controller";

// ... código existente ...

// Actualizar las rutas de wallet para usar los controladores
router.get("/wallet", authMiddleware, obtenerTarjetas);
router.post("/save-card", authMiddleware, guardarTarjeta);
router.delete("/card/:cardId", authMiddleware, eliminarTarjeta);
router.post("/card/:cardId/default", authMiddleware, establecerPredeterminada);

export default router;
```

---

## 🧪 Script de Prueba

```typescript
// test-wallet.ts
// Ejecutar con: npx ts-node test-wallet.ts

import { saveCard, getUserCards, setDefaultCard, deleteCard } from "./config/firebaseDB";

async function testWallet() {
  const testUid = "test-user-123";
  
  console.log("1. Guardando tarjeta...");
  const newCard = await saveCard(testUid, {
    stripePaymentMethodId: "pm_1234567890",
    last4: "4242",
    brand: "visa",
    expMonth: 12,
    expYear: 2025,
    isDefault: false
  });
  console.log("✅ Tarjeta guardada:", newCard);
  
  console.log("\n2. Obteniendo tarjetas...");
  const cards = await getUserCards(testUid);
  console.log("✅ Tarjetas obtenidas:", cards);
  
  console.log("\n3. Estableciendo como predeterminada...");
  await setDefaultCard(testUid, newCard.id);
  const updatedCards = await getUserCards(testUid);
  console.log("✅ Tarjeta actualizada:", updatedCards);
  
  console.log("\n4. Eliminando tarjeta...");
  await deleteCard(testUid, newCard.id);
  const finalCards = await getUserCards(testUid);
  console.log("✅ Tarjeta eliminada. Tarjetas restantes:", finalCards);
}

testWallet().catch(console.error);
```

---

## 🔍 Queries de BD Recomendadas

### Firestore
```javascript
// Obtener tarjetas activas del usuario
db.collection("userCards")
  .where("uid", "==", userId)
  .where("isActive", "==", true)
  .orderBy("isDefault", "desc")
  .orderBy("createdAt", "desc")

// Obtener tarjeta predeterminada
db.collection("userCards")
  .where("uid", "==", userId)
  .where("isDefault", "==", true)
  .limit(1)
```

### MongoDB
```javascript
// Obtener tarjetas activas
UserCard.find({ uid: userId, isActive: true })
  .sort({ isDefault: -1, createdAt: -1 })

// Obtener tarjeta predeterminada
UserCard.findOne({ uid: userId, isDefault: true })

// Contar tarjetas del usuario
UserCard.countDocuments({ uid: userId, isActive: true })
```

---

## ✅ Checklist para implementar

- [ ] Elegir BD (Firestore o MongoDB)
- [ ] Crear colección/schema
- [ ] Escribir funciones CRUD
- [ ] Actualizar controlador
- [ ] Actualizar rutas
- [ ] Probar con script
- [ ] Integración con Frontend
- [ ] Tests unitarios

---

*Guía de BD completada: 16 de enero de 2026*
