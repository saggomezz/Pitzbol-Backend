import { Request, Response } from 'express';
import { db } from "../config/firebase";
import admin from "firebase-admin";
import { uploadImageToCloudinary } from "../utils/cloudinaryHelper";

const FieldValue = admin.firestore.FieldValue; 

export const registerGuide = async (req: Request, res: Response) => {
    try {
        console.log("📥 Datos recibidos en registerGuide:", JSON.stringify(req.body, null, 2));
        
        const data = req.body;
        const { uid, nombre, apellido, email } = data;

        if (!uid) {
            console.error("❌ Error: UID no proporcionado");
            return res.status(400).json({ message: 'El UID es obligatorio.' });
        }

        // Buscar datos del usuario turista para obtener nacionalidad y teléfono si no vienen en el request
        let telefono = data.telefono;
        let nacionalidad = data.nacionalidad;

        if (!telefono || !nacionalidad) {
            try {
                const turistaSnap = await db.collection("usuarios")
                    .doc("turistas")
                    .collection("lista")
                    .where("uid", "==", uid)
                    .limit(1)
                    .get();

                if (!turistaSnap.empty && turistaSnap.docs[0]) {
                    const turistaData = turistaSnap.docs[0].data();
                    if (!telefono) telefono = turistaData.telefono || "";
                    if (!nacionalidad) nacionalidad = turistaData.nacionalidad || "";
                    console.log("📋 Datos recuperados del turista - telefono:", telefono, "nacionalidad:", nacionalidad);
                }
            } catch (err) {
                console.log("ℹ️ No se encontraron datos de turista, usando solo los del request");
            }
        }

        const safeApellido = apellido ? `_${apellido}` : "";
        const customId = `${nombre}${safeApellido}`.replace(/\s+/g, '_').toLowerCase();

        console.log("🔑 UID recibido:", uid);
        console.log("📝 Custom ID generado:", customId);

        // �️ RECUPERAR FOTO DE PERFIL EXISTENTE DEL USUARIO TURISTA
        let fotoPerfil_existente = { url: "", cloudinary_id: "", subida_en: "" };
        try {
            const turistaSnap = await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .where("uid", "==", uid)
                .limit(1)
                .get();

            if (!turistaSnap.empty && turistaSnap.docs[0]) {
                const turistaData = turistaSnap.docs[0].data();
                // Preservar la foto de perfil existente
                if (turistaData["14_foto_perfil"]) {
                    fotoPerfil_existente = turistaData["14_foto_perfil"];
                    console.log("✅ Foto de perfil existente preservada:", fotoPerfil_existente.url);
                } else if (turistaData.fotoPerfil) {
                    fotoPerfil_existente = { url: turistaData.fotoPerfil, cloudinary_id: "", subida_en: "" };
                    console.log("✅ Foto de perfil heredada de campo fotoPerfil");
                }
            }
        } catch (err) {
            console.log("ℹ️ No se encontró foto de perfil existente o error al recuperarla");
        }

        // 📤 SUBIR IMÁGENES A CLOUDINARY
        let ineFrente_url = "";
        let ineReverso_url = "";
        let facePhoto_url = "";

        try {
            // Subir foto frontal de INE
            if (data.ineFrente) {
                console.log("📸 Subiendo foto frontal de INE a Cloudinary...");
                ineFrente_url = await uploadImageToCloudinary(data.ineFrente, uid, 'ine_frente');
                console.log("✅ INE frontal subida:", ineFrente_url);
            }

            // Subir foto reverso de INE
            if (data.ineReverso) {
                console.log("📸 Subiendo foto reverso de INE a Cloudinary...");
                ineReverso_url = await uploadImageToCloudinary(data.ineReverso, uid, 'ine_reverso');
                console.log("✅ INE reverso subida:", ineReverso_url);
            }

            // Subir foto de validación facial (SEPARADA DE LA FOTO DE PERFIL)
            if (data.facePhoto) {
                console.log("📸 Subiendo foto de validación facial a Cloudinary...");
                facePhoto_url = await uploadImageToCloudinary(data.facePhoto, uid, 'rostro');
                console.log("✅ Foto de rostro subida:", facePhoto_url);
            }
        } catch (uploadError) {
            console.error("❌ Error al subir imágenes a Cloudinary:", uploadError);
            return res.status(500).json({ 
                message: 'Error al procesar imágenes. Por favor, intenta de nuevo.',
                error: uploadError instanceof Error ? uploadError.message : 'Error desconocido'
            });
        }
       
        const datosSeguros = {
            "01_nombre": nombre ?? "",
            "02_apellido": apellido ?? "",
            "03_rol": "turista",
            "04_correo": email ?? "",
            "05_nacionalidad": data.nacionalidad ?? "",
            "06_telefono": data.telefono ?? "",
            "07_especialidades": data.categorias ?? [], 
            "08_rfc": data.rfc ?? "",
            "10_cp": data.codigoPostal ?? "",
            "11_foto_frente": ineFrente_url,
            "12_foto_reverso": ineReverso_url,
            "13_foto_rostro": facePhoto_url,
            "14_foto_perfil": fotoPerfil_existente,
            "15_descripcion": "",
            "16_status": "en_revision",
            "17_tarifa_mxn": data.precioMXN ?? 0,
            "18_validacion_biometrica": {
                porcentaje: data.validacion_biometrica?.porcentaje ?? 0,
                mensaje: data.validacion_biometrica?.mensaje ?? "No validado"
            },
            uid: uid, 
            createdAt: new Date().toISOString()
        };

        console.log("💾 Guardando en Firebase...");
        
        await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .doc(customId)
            .set(datosSeguros);

        console.log("✅ Documento guardado en pendientes:", customId);

        // Intentar eliminar de turistas
        try {
            await db.collection("usuarios")
                .doc("turistas")
                .collection("lista")
                .doc(customId)
                .delete();
            console.log("🗑️ Eliminado de turistas:", customId);
        } catch (deleteError) {
            console.log("ℹ️ No se encontró en turistas o ya fue eliminado");
        }

        console.log("✅ Registro de guía completado exitosamente");
        

        // Notificar a todos los administradores
        try {
            const adminsSnapshot = await db.collection('usuarios').doc('admins').collection('lista').get();
            const notificacion = {
                tipo: 'nueva_solicitud_guia',
                titulo: 'Nueva solicitud de guía',
                mensaje: `El usuario ${nombre} ${apellido} ha enviado una solicitud para ser guía.`,
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/admin/solicitudes-guias'
            };
            const batch = db.batch();
            adminsSnapshot.forEach(adminDoc => {
                const adminUid = adminDoc.data().uid;
                if (adminUid) {
                    const notifRef = db.collection('usuarios').doc('notificaciones').collection(adminUid).doc();
                    batch.set(notifRef, notificacion);
                }
            });
            await batch.commit();
            console.log('✅ Notificación enviada a administradores');
        } catch (notifError) {
            console.warn('⚠️ Error al notificar a administradores:', notifError);
        }

        // Notificar al usuario que envió la solicitud
        try {
            const userNotificacion = {
                tipo: 'info',
                titulo: 'Solicitud Enviada ✓',
                mensaje: 'Tu solicitud para ser Guía Pitzbol ha sido enviada correctamente. Estamos revisando tu información y te notificaremos pronto.',
                fecha: new Date().toISOString(),
                leido: false,
                enlace: '/guide/estatus'
            };
            await db.collection('usuarios').doc('notificaciones').collection(uid).add(userNotificacion);
            console.log('✅ Notificación enviada al usuario');
        } catch (notifError) {
            console.warn('⚠️ Error al notificar al usuario:', notifError);
        }

        res.status(201).json({ 
            message: 'Solicitud enviada a revisión con éxito', 
            status: "pendiente"
        });

    } catch (error: any) {
        console.error("❌ Error detallado en registerGuide:", error);
        console.error("Stack trace:", error.stack);
        res.status(500).json({ 
            message: 'Error interno al procesar la solicitud', 
            error: error.message 
        });
    }
};

export const addTourToGuide = async (req: Request, res: Response) => {
    try {
        const { guideId, titulo, duracion, precio, maxPersonas } = req.body;

        if (!guideId || !titulo || !duracion || !precio || !maxPersonas) {
            return res.status(400).json({ message: 'Todos los campos son obligatorios' });
        }

        const tourRef = db.collection('usuarios')
                          .doc('guias')
                          .collection('lista')
                          .doc(guideId)
                          .collection('tours_publicados');

        const nuevoTour = {
            titulo,
            duracion: Number(duracion),
            precio: typeof precio === 'string' ? parseFloat(precio.replace(/[^0-9.]/g, '')) : precio,
            maxPersonas: Number(maxPersonas),
            createdAt: new Date().toISOString()
        };

        const docAdded = await tourRef.add(nuevoTour);

        return res.status(201).json({ 
            message: 'Tour publicado con éxito', 
            id: docAdded.id,
            tour: nuevoTour 
        });
    } catch (error) {
        console.error("Error al añadir tour:", error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

export const updateGuideProfile = async (req: Request, res: Response) => {
    try {
        const uid = req.body.uid as string;
        const categorias = req.body.categorias as string[];

        if (!uid) return res.status(400).json({ message: "UID obligatorio" });

        const config = [
            { ref: db.collection('usuarios').doc('guias').collection('lista'), field: "07_especialidades" },
            { ref: db.collection('usuarios').doc('guias').collection('pendientes'), field: "07_especialidades" },
            { ref: db.collection('usuarios').doc('turistas').collection('lista'), field: "especialidades" }
        ];

        const ubicacionesActualizadas: string[] = [];
        let encontrado = false;

        // Actualizar TODAS las colecciones donde se encuentre el usuario
        for (const item of config) {
            const snap = await item.ref.where('uid', '==', uid).limit(1).get();
            
            if (!snap.empty) {
                const docSnapshot = snap.docs[0];
                
                if (docSnapshot && docSnapshot.exists) {
                    encontrado = true;
                    
                    // Preparamos el objeto de actualización
                    const updateData: { [key: string]: any } = {
                        [item.field]: categorias,
                        "updatedAt": new Date().toISOString()
                    };

                    // Sincronizar ambos campos en guías
                    if (item.field === "07_especialidades") {
                        updateData["especialidades"] = categorias;
                    } else if (item.field === "especialidades") {
                        updateData["07_especialidades"] = categorias;
                    }

                    await docSnapshot.ref.update(updateData);
                    ubicacionesActualizadas.push(item.ref.path);
                    
                    console.log(`✅ Especialidades actualizadas en: ${item.ref.path}`);
                }
            }
        }

        if (!encontrado) {
            return res.status(404).json({ message: "No se encontró el documento en ninguna colección" });
        }

        return res.status(200).json({ 
            message: "Sincronizado en todas las ubicaciones", 
            ubicacionesActualizadas,
            especialidades: categorias
        });
        
    } catch (error: any) {
        console.error("Error en updateGuideProfile:", error);
        return res.status(500).json({ message: "Error interno al actualizar" });
    }
};

export const getVerifiedGuides = async (req: Request, res: Response) => {
    try {
        console.log("📋 Obteniendo guías verificados...");

        const guidesSnapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('lista')
            .get();

        if (guidesSnapshot.empty) {
            console.log("ℹ️ No hay guías verificados registrados");
            return res.status(200).json({ guides: [] });
        }

        const guides = guidesSnapshot.docs.map(doc => {
            const data = doc.data();
            const nombre = data["01_nombre"] || data.nombre || "";
            const apellido = data["02_apellido"] || data.apellido || "";
            const nombreCompleto = `${nombre} ${apellido}`.trim();
            
            // Log para debug
            console.log(`🔍 Guía ${doc.id}:`, {
                "01_nombre": data["01_nombre"],
                "02_apellido": data["02_apellido"],
                "nombre": data.nombre,
                "apellido": data.apellido,
                "nombreCompleto": nombreCompleto
            });
            
            const guideData = {
                uid: data.uid,
                nombre: nombreCompleto,
                fotoPerfil: data["14_foto_perfil"]?.url || data.fotoPerfil || "",
                descripcion: data["15_descripcion"] || data.descripcion || "",
                idiomas: data["09_idiomas"] || data.idiomas || [],
                especialidades: data["07_especialidades"] || data.especialidades || [],
                tarifa: data["17_tarifa_mxn"] || data.tarifa || 0,
                tarifaCompleta: data["19_tarifa_dia_completo"] || data.tarifaCompleta || 0,
                rutaTour: data["20_ruta_tour"] || data.rutaTour || "",
                ubicacion: data.ubicacion || "Guadalajara, Jalisco",
                email: data["04_correo"] || data.email || "",
                telefono: data["06_telefono"] || data.telefono || "",
                calificacion: data.calificacion || 0,
                numeroResenas: data.numeroResenas || 0
            };
            
            return guideData;
        });

        console.log(`✅ Se encontraron ${guides.length} guías verificados`);
        
        // Log detallado del primer guía
        if (guides.length > 0) {
            console.log("📌 Ejemplo de guía devuelto:", {
                uid: guides[0].uid,
                nombre: guides[0].nombre,
                descripcion: guides[0].descripcion?.substring(0, 50) + "...",
                idiomas: guides[0].idiomas,
                especialidades: guides[0].especialidades
            });
        }
        
        return res.status(200).json({ 
            guides,
            total: guides.length 
        });

    } catch (error: any) {
        console.error("❌ Error al obtener guías verificados:", error);
        return res.status(500).json({ 
            message: 'Error interno al obtener guías',
            error: error.message 
        });
    }
};

export const getGuideRequest = async (req: Request, res: Response) => {
    try {
        // Obtener el UID del usuario autenticado del middleware
        const uid = (req as any).user?.uid;
        
        if (!uid) {
            return res.status(400).json({ 
                success: false,
                message: 'No se pudo obtener el UID del usuario autenticado' 
            });
        }

        console.log("📋 Obteniendo solicitud de guía para UID:", uid);

        // Buscar en la colección de pendientes
        const pendientesSnapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('pendientes')
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (!pendientesSnapshot.empty) {
            const doc = pendientesSnapshot.docs[0];
            const data = doc.data();
            
            console.log("✅ Solicitud pendiente encontrada para UID:", uid);
            
            const facePhotoUrl =
                data["13_foto_rostro"]?.url ||
                data["13_foto_rostro"]?.secure_url ||
                data["13_foto_rostro"] ||
                data.facePhoto ||
                data.fotoRostro ||
                "";

            return res.status(200).json({
                success: true,
                status: "pendiente",
                uid: data.uid,
                nombre: data["01_nombre"] || "",
                email: data["04_correo"] || "",
                rfc: data["08_rfc"] || "",
                codigoPostal: data["10_cp"] || "",
                categorias: data["07_especialidades"] || [],
                validacion_biometrica: data["18_validacion_biometrica"] || {},
                facePhoto: facePhotoUrl,
                createdAt: data.createdAt || "",
                updatedAt: data.createdAt || ""
            });
        }

        // Buscar en la colección de aprobados
        const aprobadosSnapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('lista')
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (!aprobadosSnapshot.empty) {
            const doc = aprobadosSnapshot.docs[0];
            const data = doc.data();
            
            console.log("✅ Guía aprobado encontrado para UID:", uid);
            
            const facePhotoUrl =
                data["13_foto_rostro"]?.url ||
                data["13_foto_rostro"]?.secure_url ||
                data["13_foto_rostro"] ||
                data.facePhoto ||
                data.fotoRostro ||
                "";

            return res.status(200).json({
                success: true,
                status: "aprobado",
                uid: data.uid,
                nombre: data["01_nombre"] || "",
                email: data["04_correo"] || "",
                rfc: data["08_rfc"] || "",
                codigoPostal: data["10_cp"] || "",
                categorias: data["07_especialidades"] || [],
                validacion_biometrica: data["18_validacion_biometrica"] || {},
                facePhoto: facePhotoUrl,
                createdAt: data.createdAt || "",
                updatedAt: data.createdAt || ""
            });
        }

        // Si no se encontró en ninguna colección
        console.log("ℹ️ No se encontró solicitud para UID:", uid);
        return res.status(404).json({ 
            success: false,
            message: 'No se encontró solicitud de guía para este usuario' 
        });

    } catch (error: any) {
        console.error("❌ Error al obtener solicitud de guía:", error);
        return res.status(500).json({ 
            success: false,
            message: 'Error interno al obtener solicitud',
            error: error.message 
        });
    }
};

export const getGuidePublicProfile = async (req: Request, res: Response) => {
    try {
        const { uid } = req.params;
        
        if (!uid) {
            return res.status(400).json({ 
                success: false,
                message: 'UID es requerido' 
            });
        }

        console.log("📋 Obteniendo perfil público del guía:", uid);

        // Buscar el guía en la colección de verificados
        const guidesSnapshot = await db.collection('usuarios')
            .doc('guias')
            .collection('lista')
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (guidesSnapshot.empty) {
            console.log("ℹ️ No se encontró el guía con UID:", uid);
            return res.status(404).json({ 
                success: false,
                message: 'Guía no encontrado' 
            });
        }

        const guideDoc = guidesSnapshot.docs[0];
        const data = guideDoc.data();

        const guideProfile = {
            uid: data.uid,
            nombre: `${data["01_nombre"] || data.nombre || ""} ${data["02_apellido"] || data.apellido || ""}`.trim(),
            fotoPerfil: data["14_foto_perfil"]?.url || data.fotoPerfil || "",
            descripcion: data["15_descripcion"] || data.descripcion || "",
            biografia: data["19_biografia"] || data.biografia || data["15_descripcion"] || data.descripcion || "",
            idiomas: data["09_idiomas"] || data.idiomas || [],
            especialidades: data["07_especialidades"] || data.especialidades || [],
            tarifa: data["17_tarifa_mxn"] || data.tarifa || 0,
            tarifaCompleta: data["19_tarifa_dia_completo"] || data.tarifaCompleta || null,
            rutaTour: data["20_ruta_tour"] || data.rutaTour || "",
            ubicacion: data.ubicacion || "Guadalajara, Jalisco",
            experiencia: data.experiencia || null,
            certificaciones: data.certificaciones || [],
            disponibilidad: data.disponibilidad || null,
            toursPorDia: data.toursPorDia || null,
            calificacion: data.calificacion || 4.5,
            resenas: data.numeroResenas || 0,
        };

        console.log(`✅ Perfil del guía encontrado:`, guideProfile.nombre);
        
        return res.status(200).json({ 
            success: true,
            guide: guideProfile
        });

    } catch (error: any) {
        console.error("❌ Error al obtener perfil público del guía:", error);
        return res.status(500).json({ 
            success: false,
            message: 'Error interno al obtener perfil del guía',
            error: error.message 
        });
    }
};
