import cors from 'cors';
import dotenv from "dotenv";
dotenv.config();
import express from 'express';
import authRoutes from './routes/auth.routes';
import guideRoutes from './routes/guide.routes';
import businessRoutes from "./routes/business.routes";
import paymentRoutes from "./routes/payment.routes";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

// 1. CORS primero
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 2. CONFIGURACIÓN DE LÍMITES (IMPORTANTE: Solo una vez y antes de las rutas)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// (Middleware)
app.use((req, res, next) => {
  console.log(`Petición recibida: [${req.method}] ${req.url}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/guides', guideRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/payments", paymentRoutes);


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
