// mail template 
module.exports = (otp) => `Hi there,

You requested to sign in to your DoroShop account. Please use the following one-time password (OTP) to complete your login:

🔑 OTP: ${otp}

This code is valid for 5 minutes. If you did not attempt to sign in, please ignore this email or contact our support team immediately.

Thank you for choosing DoroShop!

Best regards,
The DoroShop Team`;
