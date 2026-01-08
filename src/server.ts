import cors from 'cors';
import dotenv from "dotenv";
import express from 'express';
import authRoutes from './routes/auth.routes';
import businessRoutes from "./routes/business.routes";
import guideRoutes from './routes/guide.routes';
import ocrRoutes from './routes/ocr.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

// 1. CORS primero
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// 2. CONFIGURACIÓN DE LÍMITES (IMPORTANTE: Solo una vez y antes de las rutas)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 3. Logger para depurar
app.use((req, res, next) => {
    console.log(`Petición recibida: [${req.method}] ${req.url}`);
    next();
});

// 4. RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/guides', guideRoutes);
app.use("/api/business", businessRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send(`<h1>El Backend sí funcionaa</h1>`);
});

app.post('/test', (req, res) => {
    console.log("¡Conexión exitosa!");
    res.send("OK");
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});