// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { db, auth } from '../config/firebase';
import axios from 'axios';

// Pon tu API KEY aquí o mejor aún en un archivo .env
const FIREBASE_WEB_API_KEY = "AIzaSyA9gGWAse4hO2Kq3mbkUY-pN7EoiJLSatw";

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, nombre, apellido, telefono, nacionalidad } = req.body;

        // 1. Crear usuario en Auth (Email/Pass)
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: `${nombre} ${apellido}`
        });

        // 2. Guardar datos adicionales en Firestore
        await db.collection('usuarios').doc(userRecord.uid).set({
            nombre,
            apellido,
            email,
            telefono,
            nacionalidad,
            createdAt: new Date().toISOString(),
            role: 'user'
        });

        res.status(201).json({ msg: 'Usuario creado', uid: userRecord.uid });

    } catch (error: any) {
        console.error("ERROR EN REGISTRO:", error);
        res.status(500).json({ msg: 'Error al registrar', error: error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Usamos la API REST de Google para verificar el password
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
        
        const response = await axios.post(url, {
            email,
            password,
            returnSecureToken: true
        });

        // Retornamos el token y datos del usuario
        res.json({
            token: response.data.idToken,
            email: response.data.email,
            uid: response.data.localId
        });

    } catch (error: any) {
        console.error("ERROR EN LOGIN:", error);
        // Manejo básico de errores de credenciales
        const msg = error.response?.data?.error?.message || error.message;
        if (msg === 'EMAIL_NOT_FOUND' || msg === 'INVALID_PASSWORD') {
             res.status(401).json({ msg: 'Credenciales inválidas' });
             return; // Importante poner return para detener ejecución
        }
        res.status(500).json({ msg: 'Error en login', error: msg });
    }
};