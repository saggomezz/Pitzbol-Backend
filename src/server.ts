import cors from 'cors';
import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
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
import { ChatService } from './services/chat.service';


dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// (Middleware)
app.use((req, res, next) => {
  console.log(`Petición recibida: [${req.method}] ${req.url}`);
  next();
});

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
// Manejo de rutas no encontradas
app.use('/api', (req, res) => {
  console.warn(`⚠️ Ruta no encontrada: [${req.method}] ${req.url}`);
  res.status(404).json({
    success: false,
    msg: 'Endpoint no encontrado',
    path: req.url
  });
});

// Manejo global de errores
app.use((err: any, req: any, res: any, next: any) => {
  console.error('❌ Error en el servidor:', err);
  res.status(err.status || 500).json({
    success: false,
    msg: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});



// Socket.IO para chat en tiempo real
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  
  const userId = socket.handshake.auth.userId;
  const userType = socket.handshake.auth.userType;
  
  if (userId) {
    // Unir al usuario a su sala personal para notificaciones
    socket.join(`user:${userId}`);
    console.log(`Usuario ${userId} (${userType}) unido a su sala personal`);
  }

  // Unirse a una sala de chat
  socket.on('join-chat', (chatId: string) => {
    socket.join(chatId);
    console.log(`Usuario ${socket.id} se unió al chat ${chatId}`);
  });

  // Salir de una sala de chat
  socket.on('leave-chat', (chatId: string) => {
    socket.leave(chatId);
    console.log(`Usuario ${socket.id} salió del chat ${chatId}`);
  });

  // Enviar mensaje
  socket.on('send-message', async (data: {
    chatId: string;
    senderId: string;
    senderName: string;
    senderType: 'tourist' | 'guide';
    content: string;
  }) => {
    try {
      const message = await ChatService.saveMessage({
        chatId: data.chatId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderType: data.senderType,
        content: data.content,
        timestamp: new Date(),
        read: false,
      });

      // Emitir mensaje a todos en la sala
      io.to(data.chatId).emit('new-message', message);
    } catch (error) {
      console.error('Error al guardar mensaje:', error);
      socket.emit('message-error', { error: 'Error al enviar mensaje' });
    }
  });

  // Usuario está escribiendo
  socket.on('typing', (data: { chatId: string; userName: string }) => {
    socket.to(data.chatId).emit('user-typing', data);
  });

  // Usuario dejó de escribir
  socket.on('stop-typing', (data: { chatId: string }) => {
    socket.to(data.chatId).emit('user-stop-typing', data);
  });

  // Marcar mensajes como leídos
  socket.on('mark-as-read', (data: { chatId: string; userId: string }) => {
    // Notificar a todos en el chat que los mensajes fueron leídos
    io.to(data.chatId).emit('messages-read', data);
    console.log(`Mensajes del chat ${data.chatId} marcados como leídos por ${data.userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

app.get('/', (req, res) => {
    res.send(`
        <h1>El Backend sí funcionaa</h1>
        <p>El servidor está corriendo correctamente</p>
        <p>Usa los endpoints en <code>/api/auth/login</code> o <code>/api/auth/register</code></p>
    `);
});

httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Socket.IO corriendo en http://localhost:${PORT}`);
});
