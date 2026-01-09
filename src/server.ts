import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import guideRoutes from "./routes/guide.routes";
import businessRoutes from "./routes/business.routes";
import paymentRoutes from "./routes/payment.routes"; 

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware de logging
app.use((req, res, next) => {
  console.log(`Petición recibida: [${req.method}] ${req.url}`);
  next();
});

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/guides", guideRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/payments", paymentRoutes); 

app.get("/", (req, res) => {
  res.send(`
    <h1>El Backend sí funciona</h1>
    <p>El servidor está corriendo correctamente</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
