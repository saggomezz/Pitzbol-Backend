import { Request, Response } from 'express';
import { createWorker } from 'tesseract.js';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import * as canvas from 'canvas';
import * as path from 'path';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODELS_PATH = path.resolve(process.cwd(), 'models');
let isModelsLoaded = false;

async function ensureModelsLoaded() {
    if (isModelsLoaded) return;
    try {
        console.log(`Intentando cargar desde: ${MODELS_PATH}`);
        
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
        console.log("Detectores cargados...");
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
        console.log("Puntos faciales cargados...");
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
        console.log("Reconocimiento cargado...");
        
        isModelsLoaded = true;
    } catch (err: any) {
        console.error("Error detallado de FS:", err);
        throw new Error(`No se encontraron los modelos en ${MODELS_PATH}. Verifica los nombres de los archivos.`);
    }
}

export const verifyINE = async (req: Request, res: Response) => {
    let worker: any = null; 

    try {
        const { imageBase64, side } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ success: false, message: "No se recibió imagen" });
        }
        worker = await createWorker('spa');
        
        const { data: { text } } = await worker.recognize(imageBase64);
        const textUpper = text.toUpperCase();

        if (side === 'frente') {
            const keywordsFrente = ["INSTITUTO", "NACIONAL", "ELECTORAL", "MEXICO", "CREDENCIAL"];
            const hasKeywords = keywordsFrente.some(word => textUpper.includes(word));
            if (!hasKeywords) {
                return res.status(400).json({ success: false, message: "No se detecta una INE frontal válida." });
            }
        } else {
            const keywordsReverso = ["IDMEX", "ELECCION", "FECHA DE NACIMIENTO", "SEXO"];
            const tieneKeywordsReverso = keywordsReverso.some(word => textUpper.includes(word));
            if (!tieneKeywordsReverso && textUpper.length < 50) {
                return res.status(400).json({ success: false, message: "No se detecta el reverso de la identificación." });
            }
        }

        const rfcRegex = /[A-ZÑ&]{4}\d{6}[A-Z\d]{3}/i;
        const foundRFC = text.match(rfcRegex);

        return res.json({
            success: true,
            extractedData: {
                rfc: side === 'frente' && foundRFC ? foundRFC[0].toUpperCase() : null
            }
        });

    } catch (error: any) {
        console.error("Error en el proceso OCR:", error);
        return res.status(500).json({ success: false, message: "Error interno procesando la imagen." });
    } finally {
        if (worker && typeof worker.terminate === 'function') {
            await worker.terminate();
        }
    }
};
const prepareImage = (base64String: string): Buffer => {
    if (!base64String) throw new Error("Imagen vacía");
    const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(cleanBase64, 'base64');
};

export const compareBiometry = async (req: Request, res: Response) => {
    try {
        const { faceBase64, ineBase64 } = req.body;
        console.log("[compareBiometry] body:", Object.keys(req.body));
        if (!faceBase64 || !ineBase64) {
            console.error("[compareBiometry] Faltan imágenes");
            return res.status(400).json({ success: false, message: "Faltan imágenes." });
        }

        try {
            console.log("[compareBiometry] Cargando modelos...");
            await ensureModelsLoaded();
            console.log("[compareBiometry] Modelos cargados");
        } catch (err) {
            console.error("[compareBiometry] Error cargando modelos:", err);
            return res.status(500).json({ success: false, message: "Error cargando modelos", error: String(err) });
        }

        let confidence = "0";
        let isMatch = false;
        let nivelPrioridad = "BAJA";

        try {
            console.log("[compareBiometry] Procesando imágenes...");
            const imgIne = await canvas.loadImage(Buffer.from(ineBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64'));
            const imgFace = await canvas.loadImage(Buffer.from(faceBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64'));
            console.log("[compareBiometry] Imágenes cargadas");

            const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });

            const detectionIne = await faceapi.detectSingleFace(imgIne as any, detectionOptions).withFaceLandmarks().withFaceDescriptor();
            const detectionFace = await faceapi.detectSingleFace(imgFace as any, detectionOptions).withFaceLandmarks().withFaceDescriptor();
            console.log("[compareBiometry] Detección completada");

            if (detectionIne && detectionFace) {
                const distance = faceapi.euclideanDistance(detectionIne.descriptor, detectionFace.descriptor);
                const score = (1 - distance) * 100;
                confidence = score.toFixed(2);
                isMatch = distance < 0.70; 
                if (distance < 0.55) nivelPrioridad = "ALTA"; 
                else if (distance < 0.70) nivelPrioridad = "MEDIA";
                else nivelPrioridad = "BAJA";
            } else {
                console.warn("[compareBiometry] No se detectaron ambos rostros");
            }
        } catch (e) {
            console.error("[compareBiometry] Error en procesamiento de imagen:", e);
            return res.status(500).json({ success: false, message: "Error procesando imágenes", error: String(e) });
        }
        return res.json({
            success: true,
            confidence,
            isMatch,
            nivelPrioridad,
            message: isMatch ? "Coincidencia detectada" : "Baja coincidencia, requiere revisión manual"
        });
    } catch (error: any) {
        console.error("[compareBiometry] Error inesperado:", error);
        return res.status(500).json({ success: false, message: "Error interno del servidor", error: String(error) });
    }
};