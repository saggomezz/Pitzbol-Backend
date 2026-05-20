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
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = 595.28;
    const M = 50;                      // margen lateral
    const CW = PAGE_W - 2 * M;        // 495.28 – ancho del contenido

    // ── Header verde ─────────────────────────────────────────────
    doc.save();
    doc.rect(0, 0, PAGE_W, 108).fill('#0D601E');
    doc.restore();

    // ── Título y subtítulo en el header ──────────────────────────
    doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(26)
      .text('Recibo de pago', M, 24, { width: CW, align: 'center', lineBreak: false });
    doc.font('Helvetica').fillColor('#A8D5B0').fontSize(11)
      .text('Pitzbol · Comprobante de pago de experiencia turística',
            M, 64, { width: CW, align: 'center', lineBreak: false });

    // ── Caja de metadatos ─────────────────────────────────────────
    const metaRows: [string, string][] = [
      ['Recibo',   details.bookingId],
      ['Tarjeta',  details.cardBrand],
      ['Emitido',  formatDateTime(details.issuedAt)],
      ['Cliente',  details.touristName],
      ['Guía',     details.guideName],
    ];
    const META_ROW_H = 23;
    const metaBoxH = 14 + metaRows.length * META_ROW_H + 10;
    const metaY = 128;

    doc.save();
    doc.roundedRect(M, metaY, CW, metaBoxH, 10).fillAndStroke('#F4FAF5', '#D5E6D8');
    doc.restore();

    metaRows.forEach(([label, value], i) => {
      const ry = metaY + 14 + i * META_ROW_H;
      doc.font('Helvetica').fillColor('#748678').fontSize(10)
        .text(`${label}:`, M + 18, ry, { width: 85, lineBreak: false });
      doc.font('Helvetica-Bold').fillColor('#1A4D2E').fontSize(10)
        .text(value, M + 108, ry, { width: CW - 126, lineBreak: false });
    });

    // ── Filas de detalle ──────────────────────────────────────────
    const detailY = metaY + metaBoxH + 22;
    const dataRows: [string, string][] = [
      ['Fecha del tour', formatDate(details.fecha)],
      ['Hora de inicio', details.horaInicio],
      ['Duración',       details.duracion],
      ['Personas',       String(details.numPersonas)],
      ['Total pagado',   formatCurrency(details.total)],
    ];
    const ROW_H = 42;

    dataRows.forEach(([label, value], i) => {
      const ry = detailY + i * ROW_H;
      const bg = i % 2 === 0 ? '#F4FAF5' : '#FFFFFF';
      doc.save();
      doc.rect(M, ry, CW, ROW_H).fill(bg);
      if (i < dataRows.length - 1) {
        doc.strokeColor('#DDE8DF').moveTo(M, ry + ROW_H).lineTo(M + CW, ry + ROW_H).stroke();
      }
      doc.restore();
      doc.font('Helvetica').fillColor('#748678').fontSize(10)
        .text(label, M + 18, ry + 14, { width: 180, lineBreak: false });
      doc.font('Helvetica-Bold').fillColor('#1A1A1A').fontSize(12)
        .text(value, M + 240, ry + 13, { width: CW - 258, lineBreak: false });
    });

    // ── Caja verde de total ───────────────────────────────────────
    const totalY = detailY + dataRows.length * ROW_H + 26;
    const totalBoxH = 90;

    doc.save();
    doc.roundedRect(M, totalY, CW, totalBoxH, 14).fill('#0D601E');
    doc.restore();

    doc.font('Helvetica').fillColor('#A8D5B0').fontSize(10)
      .text('Total pagado', M + 22, totalY + 16, { width: CW - 44, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(26)
      .text(formatCurrency(details.total), M + 22, totalY + 32, { width: CW - 44, lineBreak: false });
    doc.font('Helvetica').fillColor('#C8E6C9').fontSize(9)
      .text('Este comprobante acredita el pago registrado para tu reserva en Pitzbol.',
            M + 22, totalY + 64, { width: CW - 44, lineBreak: false });

    // ── Nota de soporte ───────────────────────────────────────────
    const noteY = totalY + totalBoxH + 22;
    doc.font('Helvetica').fillColor('#9E9E9E').fontSize(9)
      .text('Si detectas un cargo no reconocido, responde a este correo o contáctanos desde soporte en Pitzbol.',
            M, noteY, { align: 'center', width: CW });

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
