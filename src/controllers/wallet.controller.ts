import { Request, Response } from 'express';
import * as WalletService from '../services/wallet.service';
import stripe from '../config/stripe';

// Obtener tarjetas del usuario
export const getUserCards = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        message: 'userId es requerido',
      });
    }

    const cards = await WalletService.getUserCards(userId);

    res.status(200).json({
      success: true,
      cards,
      total: cards.length,
    });
  } catch (error: any) {
    console.error('Error al obtener tarjetas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tarjetas',
      error: error.message,
    });
  }
};

// Agregar tarjeta a la billetera
export const addCard = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { paymentMethodId, setAsDefault } = req.body;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        message: 'userId es requerido',
      });
    }

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethodId es requerido',
      });
    }

    // Obtener detalles del payment method de Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod.card) {
      return res.status(400).json({
        success: false,
        message: 'El payment method no es una tarjeta válida',
      });
    }

    // Guardar la tarjeta
    const card = await WalletService.saveCard(userId, {
      stripePaymentMethodId: paymentMethodId,
      last4: paymentMethod.card.last4,
      brand: paymentMethod.card.brand,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    });

    // Si debe ser la predeterminada, establecerla
    if (setAsDefault) {
      await WalletService.setDefaultCard(userId, card.id);
    }

    res.status(201).json({
      success: true,
      message: 'Tarjeta agregada exitosamente',
      card,
    });
  } catch (error: any) {
    console.error('Error al agregar tarjeta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al agregar tarjeta',
      error: error.message,
    });
  }
};

// Eliminar tarjeta
export const removeCard = async (req: Request, res: Response) => {
  try {
    const { userId, cardId } = req.params;

    if (!userId || Array.isArray(userId) || !cardId || Array.isArray(cardId)) {
      return res.status(400).json({
        success: false,
        message: 'userId y cardId son requeridos',
      });
    }

    await WalletService.deleteCard(userId, cardId);

    res.status(200).json({
      success: true,
      message: 'Tarjeta eliminada exitosamente',
    });
  } catch (error: any) {
    console.error('Error al eliminar tarjeta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar tarjeta',
      error: error.message,
    });
  }
};

// Establecer tarjeta predeterminada
export const setDefaultCard = async (req: Request, res: Response) => {
  try {
    const { userId, cardId } = req.params;

    if (!userId || Array.isArray(userId) || !cardId || Array.isArray(cardId)) {
      return res.status(400).json({
        success: false,
        message: 'userId y cardId son requeridos',
      });
    }

    await WalletService.setDefaultCard(userId, cardId);

    res.status(200).json({
      success: true,
      message: 'Tarjeta establecida como predeterminada',
    });
  } catch (error: any) {
    console.error('Error al establecer tarjeta predeterminada:', error);
    res.status(500).json({
      success: false,
      message: 'Error al establecer tarjeta predeterminada',
      error: error.message,
    });
  }
};

// Obtener tarjeta predeterminada
export const getDefaultCard = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId || Array.isArray(userId)) {
      return res.status(400).json({
        success: false,
        message: 'userId es requerido',
      });
    }

    const card = await WalletService.getDefaultCard(userId);

    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró tarjeta predeterminada',
      });
    }

    res.status(200).json({
      success: true,
      card,
    });
  } catch (error: any) {
    console.error('Error al obtener tarjeta predeterminada:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tarjeta predeterminada',
      error: error.message,
    });
  }
};
