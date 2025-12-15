// Create Admin User Script
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./modules/users/users.model');

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@dorostore.com' });
    if (existingAdmin) {
      console.log('❌ Admin user already exists!');
      console.log('Email: admin@dorostore.com');
      console.log('You can login with your existing password.');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('AdminPassword123!', 12);

    // Create admin user
    const adminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@dorostore.com',
      password: hashedPassword,
      role: 'admin',
      phone: '+639123456789',
      address: {
        street: '',
        barangay: '',
        city: '',
        province: '',
        zipCode: ''
      },
      wallet: {
        cash: 0,
        usdt: 0
      },
      totalOrders: 0,
      isRestricted: false,
      isFlagged: false,
      isVerified: true,
      avatar: 'default'
    });

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@dorostore.com');
    console.log('🔐 Password: AdminPassword123!');
    console.log('🔑 Role: admin');
    console.log('');
    console.log('You can now login to the admin dashboard at:');
    console.log('Frontend: http://localhost:5173/admin');
    console.log('API: http://localhost:3001/v1/user/login');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdmin();