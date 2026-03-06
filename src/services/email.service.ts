import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

interface BaseEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const FROM_EMAIL = process.env.GMAIL_FROM || process.env.GMAIL_USER || 'notificaciones@pitzbol.com';

function getEmailTransporter() {
  if (transporter) {
    return transporter;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS;

  if (!user || !pass) {
    throw new Error('Faltan credenciales de correo (GMAIL_USER y GMAIL_APP_PASSWORD/GMAIL_PASS)');
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return transporter;
}

async function dispatchEmail(payload: BaseEmailPayload) {
  const mailer = getEmailTransporter();
  await mailer.sendMail({
    from: `Pitzbol <${FROM_EMAIL}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);

const formatDate = (rawDate: string) => {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export interface BookingConfirmationEmail {
  to: string;
  touristName: string;
  guideName: string;
  fecha: string;
  horaInicio: string;
  duracion: string;
  numPersonas: number;
  total: number;
}

export async function sendBookingConfirmationEmail(details: BookingConfirmationEmail) {
  const {
    to,
    touristName,
    guideName,
    fecha,
    horaInicio,
    duracion,
    numPersonas,
    total,
  } = details;

  const prettyDate = formatDate(fecha);
  const formattedTotal = formatCurrency(total);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e0e0e0; border-radius: 16px; padding: 32px;">
      <h2 style="color: #0D601E; text-align: center; margin-top: 0;">¡Tu reserva está en marcha! 🌿</h2>
      <p>Hola <strong>${touristName}</strong>,</p>
      <p>Confirmamos la creación de tu reserva con <strong>${guideName}</strong>. Aquí tienes los detalles:</p>
      <ul style="padding-left: 18px; color: #1a1a1a;">
        <li><strong>Fecha:</strong> ${prettyDate}</li>
        <li><strong>Hora de inicio:</strong> ${horaInicio}</li>
        <li><strong>Duración:</strong> ${duracion}</li>
        <li><strong>Personas:</strong> ${numPersonas}</li>
        <li><strong>Total estimado:</strong> ${formattedTotal}</li>
      </ul>
      <p style="margin-top: 24px;">Revisa tu panel en Pitzbol para seguir el estado del tour y coordinarte con tu guía.</p>
      <p style="color: #607d8b; font-size: 14px;">Si no reconoces esta reserva, responde a este correo o contáctanos en soporte.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #9e9e9e; text-align: center;">© ${new Date().getFullYear()} Pitzbol · Experiencias que conectan</p>
    </div>
  `;

  const text = `Hola ${touristName}, tu reserva con ${guideName} fue registrada para ${prettyDate} a las ${horaInicio}. Total estimado: ${formattedTotal}.`;

  await dispatchEmail({ to, subject: 'Confirmación de reserva - Pitzbol', html, text });
}

export interface ProfileApprovalEmail {
  to: string;
  fullName: string;
  dashboardUrl?: string;
}

export async function sendProfileApprovalEmail(details: ProfileApprovalEmail) {
  const { to, fullName, dashboardUrl = 'https://pitzbol.com/perfil' } = details;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e0e0e0; border-radius: 16px; padding: 32px;">
      <h2 style="color: #0D601E; text-align: center; margin-top: 0;">¡Perfil aprobado! 🎉</h2>
      <p>Hola <strong>${fullName}</strong>,</p>
      <p>Tu perfil ha sido aprobado por nuestro equipo. Ya puedes ingresar a tu panel para publicar experiencias, administrar tus tours y recibir reservas.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${dashboardUrl}" style="background: #0D601E; color: #fff; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: bold;">Ir a mi panel</a>
      </div>
      <p style="color: #607d8b; font-size: 14px;">Si no solicitaste este cambio, contáctanos de inmediato.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #9e9e9e; text-align: center;">© ${new Date().getFullYear()} Pitzbol · Potenciando a los guías locales</p>
    </div>
  `;

  const text = `Hola ${fullName}, tu perfil en Pitzbol fue aprobado. Entra a ${dashboardUrl} para comenzar.`;

  await dispatchEmail({ to, subject: 'Tu perfil en Pitzbol fue aprobado', html, text });
}
