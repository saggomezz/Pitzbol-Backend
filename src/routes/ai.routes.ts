import { Request, Response, Router } from "express";

const router = Router();

router.get("/ai", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    motor: "hybrid",
    descripcion: "Algoritmo híbrido constraint-based + KNN — ia-engine.ts (pitzbol-web :3003). Ollama eliminado.",
    endpoints: {
      places: "GET http://localhost:3003/api/places — datos para el motor híbrido",
      generateItinerary: "ia-engine.ts → generateItinerary(places, opts)",
      knn: "ia-engine.ts → sortByProximity() + haversine()",
      addStop: "ia-engine.ts → pickAddStop() / pickReplaceStop()",
    },
  });
});

export default router;
