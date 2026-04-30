/**
 * Integration-style tests for payment flows (Stripe + Firestore)
 */

describe('PaymentService integration (Stripe + Firestore)', () => {
  test('createPaymentIntent saves payment and calls Stripe', async () => {
    const { PaymentService } = require('../../src/services/payment.service');
    const BookingService = require('../../src/services/booking.service').BookingService;
    const stripe = require('../../src/config/stripe').default;

    // Mock booking to belong to the paying user
    jest.spyOn(BookingService, 'getBookingById').mockResolvedValue({ id: 'b1', touristId: 'user1', guideId: 'g1' });

    const result = await PaymentService.createPaymentIntent({ bookingId: 'b1', userId: 'user1', amount: 123.45, currency: 'mxn' });

    expect(result.paymentIntentId).toBe('pi_test');
    expect(stripe.paymentIntents.create).toHaveBeenCalled();

    const mockDb = (global as any).__mockDb;
    const payments = mockDb.getDocumentsAtPath('payments');
    expect(payments.length).toBeGreaterThan(0);
    const saved = payments[0].data();
    expect(saved.paymentIntentId).toBe('pi_test');
  });
});
