export interface SavedCard {
  id: string; // Payment Method ID de Stripe
  brand: string; // visa, mastercard, amex, etc.
  last4: string; // Últimos 4 dígitos
  exp_month: number;
  exp_year: number;
  isDefault: boolean; // Si es la tarjeta predeterminada
  createdAt: string;
}

export interface Wallet {
  userId: string;
  stripeCustomerId?: string; // Customer ID de Stripe
  cards: SavedCard[];
  createdAt: string;
  updatedAt: string;
}

export interface AddCardRequest {
  userId: string;
  paymentMethodId: string;
  setAsDefault?: boolean;
}

export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentIntentId: string;
  paymentMethodId: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentRequest {
  bookingId: string;
  userId: string;
  amount: number;
  currency?: string;
  paymentMethodId?: string; // Si se pasa, se usa esa tarjeta guardada
  saveCard?: boolean; // Si debe guardar la tarjeta para futuro uso
}

export interface ConfirmPaymentRequest {
  paymentIntentId: string;
  paymentMethodId: string;
}
