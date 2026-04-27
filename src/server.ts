import cors from 'cors';
import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.routes';
import guideRoutes from './routes/guide.routes';
import businessRoutes from "./routes/business.routes";
import ocrRoutes from './routes/ocr.routes';
import adminRoutes from './routes/admin.routes';
import paymentRoutes from "./routes/payment.routes";
import perfilRoutes from './routes/perfil.routes';
import historialRoutes from './routes/historial.routes';
import placesRoutes from './routes/places.routes';
import supportRoutes from './routes/support.routes';
import favoritesRoutes from './routes/favorites.routes';
import chatRoutes from './routes/chat.routes';
import bookingRoutes from './routes/booking.routes';
import ratingRoutes from './routes/rating.routes';
import placeRatingRoutes from './routes/place-rating.routes';
import availabilityRoutes from './routes/availability.routes';
import walletRoutes from './routes/wallet.routes';
import itinerariosRoutes from './routes/itinerarios.routes';
import aiRoutes from "./routes/ai.routes";
import toursRoutes from "./routes/tours.routes";
import { ChatService } from './services/chat.service';
import { setSocketServer } from './socket';
import { startBusinessWatcher } from './services/businessWatcher';

process.on('uncaughtException', (error: any) => {
  if (error?.code === 'ECONNRESET') {
    console.warn('[server] Ignorando ECONNRESET transitorio');
    return;
  }

  console.error('[server] Uncaught exception', error);
});

process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'ECONNRESET') {
    console.warn('[server] Ignorando ECONNRESET transitorio en rechazo no manejado');
    return;
  }

  console.error('[server] Unhandled rejection', reason);
});

const app = express();
const httpServer = createServer(app);

// Orígenes permitidos centralizados
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://pitzbol.me',
        'https://www.pitzbol.me',
        'https://api.pitzbol.me',
        'https://api.pitzbol.me:8443',
        'https://ia.pitzbol.me',
        'https://ia.pitzbol.me:8443',
      ]
).map(o => o.trim());

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.hostname === 'pitzbol.me' || parsedOrigin.hostname.endsWith('.pitzbol.me');
  } catch {
    return false;
  }
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});
setSocketServer(io);

io.engine.on('connection_error', (err) => {
  console.error('[socket.io] connection_error', {
    code: (err as any)?.code,
    message: (err as any)?.message,
    context: (err as any)?.context,
  });
});

io.engine.on('initial_headers', (headers, req) => {
  console.log('[socket.io] initial_headers', req.url);
});

io.engine.on('headers', (headers, req) => {
  if (req.url?.includes('/socket.io')) {
    console.log('[socket.io] headers', req.method, req.url);
  }
});

const PORT = Number(process.env.PORT) || 3001;

// Helmet: security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", ...allowedOrigins],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Global rate limiter: 200 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, msg: 'Demasiadas solicitudes, intente más tarde' },
}));

app.use(cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body limits: 10MB for general, 50MB only for OCR/upload specific routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Request logging removed to reduce debug noise in production

app.use('/api/auth', authRoutes);
app.use('/api/guides', guideRoutes);
app.use("/api/business", businessRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api', historialRoutes);
app.use('/api/lugares', placesRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/place-ratings', placeRatingRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/itinerarios', itinerariosRoutes);
app.use('/api', aiRoutes);
app.use('/api/tours', toursRoutes);

app.use('/api', (req, res) => {
  console.warn(`Ruta no encontrada: [${req.method}] ${req.url}`);
  res.status(404).json({
    success: false,
    msg: 'Endpoint no encontrado',
    path: req.url
  });
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error('Error en el servidor:', err);
  // Never expose internal error details to clients in production
  res.status(err.status || 500).json({
    success: false,
    msg: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor',
  });
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (socket as any).userId = decoded.uid;
    (socket as any).userRole = decoded.role;
    next();
  } catch {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  const userId = (socket as any).userId;
  const userType = (socket as any).userRole;

  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`Usuario ${userId} (${userType}) unido a su sala personal`);
  }

  socket.on('join-chat', (chatId: string) => {
    socket.join(chatId);
    console.log(`Usuario ${socket.id} se unio al chat ${chatId}`);
  });

  socket.on('leave-chat', (chatId: string) => {
    socket.leave(chatId);
    console.log(`Usuario ${socket.id} salio del chat ${chatId}`);
  });

  socket.on('send-message', async (data: {
    chatId: string;
    senderId: string;
    senderName: string;
    senderType: 'tourist' | 'guide';
    content: string;
  }) => {
    try {
      // Prevent senderId spoofing: enforce authenticated user identity
      const authenticatedUid = (socket as any).userId;
      if (!authenticatedUid || data.senderId !== authenticatedUid) {
        socket.emit('message-error', { error: 'No autorizado' });
        return;
      }

      const message = await ChatService.saveMessage({
        chatId: data.chatId,
        senderId: authenticatedUid,
        senderName: data.senderName,
        senderType: data.senderType,
        content: data.content,
        timestamp: new Date(),
        read: false,
      });

      io.to(data.chatId).emit('new-message', message);
    } catch (error) {
      console.error('Error al guardar mensaje:', error);
      socket.emit('message-error', { error: 'Error al enviar mensaje' });
    }
  });

  socket.on('typing', (data: { chatId: string; userName: string }) => {
    socket.to(data.chatId).emit('user-typing', data);
  });

  socket.on('stop-typing', (data: { chatId: string }) => {
    socket.to(data.chatId).emit('user-stop-typing', data);
  });

  socket.on('mark-as-read', (data: { chatId: string; userId: string }) => {
    const authenticatedUid = (socket as any).userId;
    if (!authenticatedUid || data.userId !== authenticatedUid) return;
    io.to(data.chatId).emit('messages-read', data);
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Pitzbol API running' });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Socket.IO corriendo en puerto ${PORT}`);
  // Start Firestore watchers to auto-detect business name changes
  try {
    startBusinessWatcher();
  } catch (err) {
    console.error('[server] Error starting business watcher', err);
  }
});