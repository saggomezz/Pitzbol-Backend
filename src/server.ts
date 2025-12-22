import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Permite conexión desde tu Frontend
app.use(express.json()); // Permite leer JSON

// Rutas
app.use('/api/auth', authRoutes);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});