import { db, auth } from '../config/firebase';

export const createInitialAdmin = async () => {
    try {
        const adminEmail = "pitzbol2026@gmail.com";
        const adminPassword = "pitzbol"; // Pon la que quieras aquí

        // 1. Crear en Firebase Auth
        const userRecord = await auth.createUser({
            email: adminEmail,
            password: adminPassword,
            displayName: "Admin Pitzbol",
        });

        // 2. Guardar en la carpeta organizada que definimos
        await db.collection("usuarios")
            .doc("admins")
            .collection("lista")
            .doc("Admin_Pitzbol") // ID legible
            .set({
                uid: userRecord.uid,
                nombre: "Admin",
                apellido: "Pitzbol",
                email: adminEmail,
                role: "admin",
                createdAt: new Date().toISOString()
            });

        console.log("✅ Admin creado con éxito");
    } catch (error) {
        console.error("❌ Error creando admin:", error);
    }
}; 