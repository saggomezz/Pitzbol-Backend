import { Request, Response } from "express";
import { db } from "../config/firebase";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/generateToken";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { nombre, apellidos, nacionalidad, telefono, correo, password } = req.body;

    // Validar que no exista un usuario con ese email
    const existing = await db
      .collection("usuarios")
      .where("correo", "==", correo)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUserRef = await db.collection("usuarios").add({
      nombre,
      apellidos,
      nacionalidad,
      telefono,
      correo,
      password: hashedPassword,
    });

    const token = generateToken(newUserRef.id);

    res.status(201).json({
      message: "Usuario registrado correctamente",
      uid: newUserRef.id,
      token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { correo, password } = req.body;

    const snapshot = await db
      .collection("usuarios")
      .where("correo", "==", correo)
      .get();

    // EXTRA: destructuración limpia para evitar que TS marque undefined
    const [userDoc] = snapshot.docs;

    if (!userDoc) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const userData = userDoc.data();

    const validPassword = await bcrypt.compare(password, userData.password);

    if (!validPassword) {
      return res.status(403).json({ error: "Contraseña incorrecta" });
    }

    const token = generateToken(userDoc.id);

    res.json({
      message: "Inicio de sesión exitoso",
      uid: userDoc.id,
      token,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
