const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuración de transporte
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Registra el correo en un archivo de log persistente (Regla 4)
 */
function logMailToFile(to, subject, body) {
    // Apuntamos a la raíz del proyecto (logs/) para que coincida con el volumen de Docker
    const logDir = path.join(__dirname, '../../logs');
    const logFile = path.join(logDir, 'mail.log');
    
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] TO: ${to} | SUBJECT: ${subject}\nBODY: ${body}\n${'='.repeat(50)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
}

/**
 * Envía el código de verificación por email.
 * Implementa Fallback y Bypass (Regla 11)
 */
async function sendVerificationEmail(email, name, code) {
    const isBypass = process.env.SKIP_EMAIL_VERIFICATION === 'true';
    const hasCreds = process.env.SMTP_USER && process.env.SMTP_PASS;

    const subject = `🔐 ${code} es tu código de verificación`;
    const htmlBody = `Hola ${name}, tu código es: ${code}`;

    // Si el bypass está activo o faltan credenciales, logueamos y salimos con éxito ficticio
    if (isBypass || !hasCreds) {
        console.log(`ℹ️ [MailService] ${isBypass ? 'BYPASS ACTIVO' : 'SIN CONFIG'} - Código para ${email}: ${code}`);
        logMailToFile(email, subject, htmlBody);
        return true; 
    }

    const mailOptions = {
        from: `"Reservas INTA" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #10b981; text-align: center;">Hola, ${name}!</h2>
                <p style="font-size: 16px; color: #333;">Gracias por registrarte en el sistema de Reservas del INTA. Para activar tu cuenta, ingresa el siguiente código en la aplicación:</p>
                <div style="background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0e131e;">${code}</span>
                </div>
                <p style="font-size: 14px; color: #666; text-align: center;">Este código expirará en 30 minutos.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #999; text-align: center;">Si no solicitaste este registro, por favor ignora este correo.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('❌ [MailService] Fallo real de envío:', error.message);
        logMailToFile(email, `ERROR: ${subject}`, error.message);
        return false;
    }
}

module.exports = { sendVerificationEmail };
