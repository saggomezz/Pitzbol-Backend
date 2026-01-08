import { Request, Response } from 'express';
import { createWorker } from 'tesseract.js';
import * as faceapi from 'face-api.js';
import { createCanvas, Image, loadImage } from 'canvas';
import path from 'path';

// Configuración de entorno para face-api.js
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas: createCanvas().constructor, Image });

const MODELS_PATH = path.resolve(process.cwd(), 'models');
let isModelsLoaded = false;

async function ensureModelsLoaded() {
    if (isModelsLoaded) return;
    try {
        console.log(`Intentando cargar desde: ${MODELS_PATH}`);
        
        // Carga secuencial para identificar cuál falla exactamente
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
    try {
        const { imageBase64, side } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ success: false, message: "No se recibió imagen" });
        }

        const worker = await createWorker('spa');
        const { data: { text } } = await worker.recognize(imageBase64);
        await worker.terminate();

        const textUpper = text.toUpperCase();

        if (side === 'frente') {
            const keywordsFrente = ["INSTITUTO", "NACIONAL", "ELECTORAL", "MEXICO", "CREDENCIAL"];
            const hasKeywords = keywordsFrente.some(word => textUpper.includes(word));

            if (!hasKeywords) {
                return res.status(400).json({ 
                    success: false, 
                    message: "No se detectan elementos de una INE frontal válida." 
                });
            }
        } else {
            const keywordsReverso = ["IDMEX", "ELECCION", "FECHA DE NACIMIENTO", "SEXO"];
            const keywordsFrente = ["INSTITUTO", "NACIONAL", "ELECTORAL"];

            const tieneKeywordsReverso = keywordsReverso.some(word => textUpper.includes(word));
            const tieneKeywordsFrente = keywordsFrente.some(word => textUpper.includes(word));

            if (tieneKeywordsFrente || (!tieneKeywordsReverso && textUpper.length < 50)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "La imagen no corresponde al reverso de una identificación oficial." 
                });
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
        return res.status(500).json({ success: false, message: "Error procesando OCR." });
    }
};

const prepareImage = (base64: string): string => {
    if (base64.startsWith('data:image')) {
        return base64.replace(/\s/g, '');
    }
    return `data:image/jpeg;base64,${base64.replace(/\s/g, '')}`;
};

export const compareBiometry = async (req: Request, res: Response) => {
    try {
        const { faceBase64, ineBase64 } = req.body;

        if (!faceBase64 || !ineBase64) {
            return res.status(400).json({ success: false, message: "Faltan imágenes." });
        }

        await ensureModelsLoaded();

        console.log("2. Decodificando imágenes...");
        
        // Limpiamos los strings antes de enviarlos a loadImage
        const cleanIne = prepareImage(ineBase64);
        const cleanFace = prepareImage(faceBase64);

        const imgIne = await loadImage(cleanIne);
        const imgFace = await loadImage(cleanFace);

        console.log("3. Buscando rostros...");
        const detectionIne = await faceapi.detectSingleFace(imgIne as any).withFaceLandmarks().withFaceDescriptor();
        const detectionFace = await faceapi.detectSingleFace(imgFace as any).withFaceLandmarks().withFaceDescriptor();

        if (!detectionIne || !detectionFace) {
            console.log("⚠️ No se detectaron ambos rostros");
            return res.status(400).json({ 
                success: false, 
                message: "No se detectó un rostro claro. Asegúrate de que la iluminación sea buena y el rostro esté centrado." 
            });
        }

        const distance = faceapi.euclideanDistance(detectionIne.descriptor, detectionFace.descriptor);
        const isMatch = distance < 0.6;
        const confidence = ((1 - distance) * 100).toFixed(2);

        console.log(`✅ Comparación terminada: ${isMatch ? 'EXITOSA' : 'FALLIDA'}`);

        return res.json({
            success: isMatch,
            confidence,
            message: isMatch ? "Identidad confirmada" : "El rostro no coincide con la identificación."
        });

    } catch (error: any) {
        console.error("🔥 Error crítico:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: "Error interno en el procesamiento de imagen",
            error: error.message 
        });
    }
};