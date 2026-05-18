import nodemailer from 'nodemailer';

const PDFDocument = require('pdfkit');

let transporter: nodemailer.Transporter | null = null;

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface BaseEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

const FROM_EMAIL = process.env.GMAIL_FROM || process.env.GMAIL_USER || 'pitzbol2026@gmail.com';

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
    attachments: payload.attachments,
  });
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

const formatDateTime = (rawDate?: string | Date) => {
  if (!rawDate) {
    return new Date().toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return String(rawDate);
  }

  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

async function buildPaymentReceiptPdf(details: PaymentReceiptEmail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#0D601E').fontSize(24).text('Recibo de pago', { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#4F6F57').fontSize(11).text('Pitzbol · Comprobante de pago de experiencia turística', { align: 'center' });
    doc.moveDown(1.5);

    doc.roundedRect(50, doc.y, 495, 110, 16).fillAndStroke('#F4FAF5', '#D5E6D8');
    doc.fillColor('#1A4D2E').fontSize(12).text(`Recibo: ${details.bookingId}`, 70, doc.y - 96);
    doc.fontSize(11).fillColor('#48634E').text(`Tarjeta: ${details.cardBrand}`, 70, doc.y + 6);
    doc.text(`Emitido: ${formatDateTime(details.issuedAt)}`, 70, doc.y + 6);
    doc.text(`Cliente: ${details.touristName}`, 70, doc.y + 6);
    doc.text(`Guía: ${details.guideName}`, 70, doc.y + 6);
    doc.moveDown(3.5);

    const rows = [
      ['Fecha del tour', formatDate(details.fecha)],
      ['Hora de inicio', details.horaInicio],
      ['Duración', details.duracion],
      ['Personas', String(details.numPersonas)],
      ['Total pagado', formatCurrency(details.total)],
    ];

    rows.forEach(([label, value]) => {
      const rowY = doc.y;
      doc.fillColor('#748678').fontSize(10).text(label, 60, rowY, { width: 155 });
      const afterLabel = doc.y;
      doc.fillColor('#1A1A1A').fontSize(12).text(value, 235, rowY, { width: 295 });
      if (afterLabel > doc.y) doc.y = afterLabel;
      doc.moveDown(0.8);
      doc.strokeColor('#E1ECE3').moveTo(60, doc.y).lineTo(535, doc.y).stroke();
      doc.moveDown(0.8);
    });

    doc.moveDown(1);
    doc.roundedRect(50, doc.y, 495, 88, 16).fillAndStroke('#0D601E', '#0D601E');
    doc.fillColor('#FFFFFF').fontSize(11).text('Resumen', 70, doc.y - 74);
    doc.fontSize(20).text(formatCurrency(details.total), 70, doc.y + 4);
    doc.fontSize(10).text('Este comprobante acredita el pago registrado para tu reserva en Pitzbol.', 70, doc.y + 8, { width: 420 });

    doc.fillColor('#6C7A70').fontSize(9).text(
      'Si detectas un cargo no reconocido, responde a este correo o contáctanos desde soporte en Pitzbol.',
      50,
      760,
      { align: 'center', width: 495 }
    );

    doc.end();
  });
}

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

export interface PaymentReceiptEmail {
  to: string;
  touristName: string;
  guideName: string;
  bookingId: string;
  cardBrand: string;
  fecha: string;
  horaInicio: string;
  duracion: string;
  numPersonas: number;
  total: number;
  issuedAt?: string | Date;
}

export async function sendPaymentReceiptEmail(details: PaymentReceiptEmail) {
  const prettyDate = formatDate(details.fecha);
  const issuedAt = formatDateTime(details.issuedAt);
  const formattedTotal = formatCurrency(details.total);
  const safeTouristName = escapeHtml(details.touristName);
  const safeGuideName = escapeHtml(details.guideName);
  const safeBookingId = escapeHtml(details.bookingId);
  const safeCardBrand = escapeHtml(details.cardBrand);

  const pdfBuffer = await buildPaymentReceiptPdf(details);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e0e0e0; border-radius: 16px; padding: 32px;">
      <h2 style="color: #0D601E; text-align: center; margin-top: 0;">Tu pago fue procesado correctamente</h2>
      <p>Hola <strong>${safeTouristName}</strong>,</p>
      <p>Adjuntamos tu recibo en PDF correspondiente al pago de tu reserva con <strong>${safeGuideName}</strong>.</p>
      <div style="background: #F4FAF5; border: 1px solid #D5E6D8; border-radius: 14px; padding: 18px; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><strong>Reserva:</strong> ${safeBookingId}</p>
        <p style="margin: 0 0 8px;"><strong>Tarjeta:</strong> ${safeCardBrand}</p>
        <p style="margin: 0 0 8px;"><strong>Fecha del tour:</strong> ${prettyDate}</p>
        <p style="margin: 0 0 8px;"><strong>Hora:</strong> ${escapeHtml(details.horaInicio)}</p>
        <p style="margin: 0 0 8px;"><strong>Duración:</strong> ${escapeHtml(details.duracion)}</p>
        <p style="margin: 0 0 8px;"><strong>Personas:</strong> ${details.numPersonas}</p>
        <p style="margin: 0;"><strong>Total pagado:</strong> ${formattedTotal}</p>
      </div>
      <p style="font-size: 13px; color: #607d8b;">Comprobante emitido: ${issuedAt}</p>
      <p style="font-size: 13px; color: #607d8b;">Si no reconoces este pago, responde a este correo o contáctanos desde soporte.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #9e9e9e; text-align: center;">© ${new Date().getFullYear()} Pitzbol · Experiencias que conectan</p>
    </div>
  `;

  const text = `Hola ${details.touristName}, tu pago de ${formattedTotal} para la reserva ${details.bookingId} con ${details.guideName} fue procesado correctamente. Se adjunta tu recibo PDF.`;

  await dispatchEmail({
    to: details.to,
    subject: 'Recibo de pago - Pitzbol',
    html,
    text,
    attachments: [{
      filename: `recibo-pitzbol-${details.bookingId}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
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

export async function sendVerificationCodeEmail(to: string, code: string, nombre: string) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f9f9f9;border-radius:16px;overflow:hidden;">
      <div style="background:#1A4D2E;padding:28px 32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:26px;font-weight:900;letter-spacing:1px;">PITZBOL</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Tu guía para el Mundial 2026 en Guadalajara</p>
      </div>
      <div style="padding:32px;background:white;">
        <p style="color:#1A4D2E;font-size:16px;margin:0 0 8px;">Hola${nombre ? ' ' + nombre : ''},</p>
        <p style="color:#555;font-size:14px;margin:0 0 24px;">Tu código de verificación para crear tu cuenta en Pitzbol es:</p>
        <div style="background:#F0F7F0;border:2px dashed #1A4D2E;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
          <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0D601E;font-family:monospace;">${code}</span>
        </div>
        <p style="color:#999;font-size:12px;margin:0;">Este código expira en <strong>5 minutos</strong>. Si no solicitaste crear una cuenta, ignora este mensaje.</p>
      </div>
      <div style="background:#f0f0f0;padding:16px;text-align:center;">
        <p style="color:#aaa;font-size:11px;margin:0;">© 2026 Pitzbol · Guadalajara, México</p>
      </div>
    </div>
  `;
  const text = `Tu código de verificación de Pitzbol es: ${code}. Expira en 5 minutos.`;
  await dispatchEmail({ to, subject: 'Tu código de verificación — Pitzbol', html, text });
}
