import cors from 'cors';
import dotenv from "dotenv";
dotenv.config();
import express from 'express';
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


dotenv.config();
const app = express();
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



app.get('/', (req, res) => {
    res.send(`
        <h1>El Backend sí funcionaa</h1>
        <p>El servidor está corriendo correctamente</p>
        <p>Usa los endpoints en <code>/api/auth/login</code> o <code>/api/auth/register</code></p>
    `);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
