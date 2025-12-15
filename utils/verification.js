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

    await transporter.sendMail(mailOptions);
};
