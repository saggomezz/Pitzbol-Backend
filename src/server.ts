import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// (Middleware)
app.use((req, res, next) => {
    console.log(`📢 Petición recibida: [${req.method}] ${req.url}`);
    next();
});
// ------------------------------------------------

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.send(`
        <h1>¡El Backend de Pitzbol está vivo! ⚽️</h1>
        <p>El servidor está corriendo correctamente.</p>
        <p>Usa los endpoints en <code>/api/auth/login</code> o <code>/api/auth/register</code></p>
    `);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});