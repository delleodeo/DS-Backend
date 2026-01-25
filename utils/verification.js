const nodemailer = require("nodemailer");
require("dotenv").config();
const otpTemplate = require("./otpTemplate.js")
const logger = require("./logger");
const monitoringService = require("./monitoringService");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // set to true if using port 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false, // 👈 allow self-signed certs
    }
});

// Verify mailer configuration and connectivity
async function verifyMailer() {
    try {
        await transporter.verify();
        monitoringService.recordExternalSuccess('mailer-verification');
        logger.info('Mailer verification succeeded', { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT });
        return true;
    } catch (err) {
        monitoringService.recordExternalError('mailer-verification');
        logger.warn('Mailer verification failed', { message: err && err.message ? err.message : String(err) });
        throw err;
    }
}

// Helper to send mail with retries and exponential backoff
async function sendWithRetries(mailOptions, maxAttempts = 3) {
    let attempt = 0;
    let delay = 500; // ms
    let lastErr = null;

    while (attempt < maxAttempts) {
        try {
            attempt++;
            const res = await transporter.sendMail(mailOptions);
            monitoringService.recordExternalSuccess('mailer');
            logger.info('Mail sent', { to: mailOptions.to, subject: mailOptions.subject, attempt });
            return res;
        } catch (err) {
            lastErr = err;
            monitoringService.recordExternalError('mailer');
            logger.error(`Mailer send failed (attempt ${attempt}): ${err && err.message ? err.message : String(err)}`, { code: err && err.code });
            if (attempt >= maxAttempts) break;
            // simple exponential backoff
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
        }
    }

    // Throw the last error so callers can handle  it
    throw lastErr || new Error('Unknown mailer error');
}

exports.verifyMailer = verifyMailer;

exports.sendVerificationEmail = async (to, otp) => {
    const mailOptions = {
        from: `"DoroShop" <${process.env.SMTP_USER}>`,
        to,
        subject: "Your One-Time Password (OTP) for DoroShop Sign In",
        text: otpTemplate(otp),
    };

    await sendWithRetries(mailOptions);
};

exports.sendSellerWelcomeEmail = async (to, shopName, userName) => {
    const welcomeTemplate = `
🎉 Welcome to DoroShop Sellers!

Congratulations ${userName}!

Your seller application for "${shopName}" has been approved! You are now officially part of the DoroShop seller community.

What's Next?
✅ Login to your seller dashboard
✅ Upload your first products
✅ Set up your shop profile
✅ Start selling to thousands of customers

Important Information:
• Commission: 5% per successful sale
• Payment processing: 2-3 business days
• Customer support: Available 24/7
• Product guidelines: Must comply with our terms

Seller Dashboard: ${process.env.FRONTEND_URL || 'https://yourstore.com'}/vendor/dashboard

Need help? Contact our seller support team at seller-support@doroshop.com

Welcome aboard!
The DoroShop Team
    `;

    const mailOptions = {
        from: `"DoroShop Seller Team" <${process.env.SMTP_USER}>`,
        to,
        subject: "🎉 Welcome to DoroShop Sellers - Application Approved!",
        text: welcomeTemplate,
    };

    await sendWithRetries(mailOptions);
};
