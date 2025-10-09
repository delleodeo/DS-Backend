const nodemailer = require("nodemailer");
require("dotenv").config();
const otpTemplate = require("./otpTemplate.js")

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

exports.sendVerificationEmail = async (to, otp) => {
    const mailOptions = {
        from: `"DoroShop" <${process.env.SMTP_USER}>`,
        to,
        subject: "Your One-Time Password (OTP) for DoroShop Sign In",
        text: otpTemplate(otp),
    };

    await transporter.sendMail(mailOptions);
};
