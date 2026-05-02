/// <reference types="jest" />
// Common test setup for Pitzbol-Backend

import { createMockFirestore } from './mocks/mockFirestore';

// Ensure env variables required by config files don't throw at import time
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test_project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@pitzbol.test';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----';

const mockDb = createMockFirestore();
(global as any).__mockDb = mockDb;

// Mock firebase-admin to use the in-memory Firestore
const firestoreFn: any = () => mockDb;
firestoreFn.FieldValue = {
  serverTimestamp: () => ({ seconds: Math.floor(Date.now() / 1000) })
};

const adminMock: any = {
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  firestore: firestoreFn,
  auth: () => ({
    createUser: jest.fn().mockResolvedValue({ uid: 'mock_user' }),
    setCustomUserClaims: jest.fn().mockResolvedValue(null),
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'mock_user', role: 'ADMIN' })
  })
};

jest.mock('firebase-admin', () => ({ __esModule: true, default: adminMock }));

// Mock stripe config module so tests don't call external API
const stripeMock = {
  customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
  paymentMethods: { retrieve: jest.fn().mockResolvedValue({ id: 'pm_test' }), attach: jest.fn().mockResolvedValue({}) },
  setupIntents: { create: jest.fn().mockResolvedValue({ client_secret: 'seti_secret' }) },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_secret', status: 'requires_payment_method' }),
    confirm: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    retrieve: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    cancel: jest.fn().mockResolvedValue({})
  },
  webhooks: { constructEvent: jest.fn() }
};
jest.mock('../src/config/stripe', () => ({ __esModule: true, default: stripeMock }));

// Mock Cloudinary uploader (upload_stream usage)
jest.mock('cloudinary', () => ({
  __esModule: true,
  v2: {
    config: (opts: any) => {},
    uploader: {
      upload_stream: (opts: any, cb: any) => ({
        end: (buffer: any) => {
          setImmediate(() => cb(null, { secure_url: `https://mock.cloud/${Math.random().toString(36).slice(2)}.jpg` }));
        }
      })
    }
  }
}));

// Mock socket helpers so emits are observable but non-fatal
jest.mock('../src/socket', () => ({
  __esModule: true,
  emitNewPendingBusiness: jest.fn(),
  emitNotificationToUser: jest.fn(),
  setSocketServer: jest.fn(),
  emitBusinessStatusChange: jest.fn()
}));

jest.setTimeout(15000);

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  (console.log as jest.Mock).mockRestore && (console.log as jest.Mock).mockRestore();
  (console.warn as jest.Mock).mockRestore && (console.warn as jest.Mock).mockRestore();
});
