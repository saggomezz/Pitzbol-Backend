router.get("/ai", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    msg: "Endpoint GET /api/ai activo. Usa POST para IA.",
  });
});
import axios from "axios";
import { Request, Response, Router } from "express";

const router = Router();

router.post("/ai", async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      msg: "El prompt es requerido",
    });
  }

  try {
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "mundial-ai",
        prompt: prompt,
        stream: false
      }
    );

    return res.status(200).json({
      success: true,
      output: response.data.response,
    });

  } catch (error: any) {
    console.error("Error Ollama:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      msg: "Error generando respuesta IA",
    });
  }
});

export default router;
