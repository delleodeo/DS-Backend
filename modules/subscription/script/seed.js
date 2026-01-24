const mongoose = require("mongoose");
const { Plan } = require("../models/Plan.js");
const connectDB = require("../../../config/db.js");
require("dotenv").config()

const MONGO_URL = process.env.MONGO_URL;

const seedPlans = async () => {
  await connectDB();

  const plans = [
    {
      code: "basic-monthly",
      name: "Basic Monthly",
      description: "Starter plan",
      price: 0,
      currency: "PHP",
      interval: "monthly",
      features: [],
      limits: { products: 50, analytics: false, prioritySupport: false, ads: true },
      isActive: true,
      sortOrder: 1,
    },
    {
      code: "pro-monthly",
      name: "Pro Monthly",
      description: "Best for growing sellers",
      price: 299,
      currency: "PHP",
      interval: "monthly",
      features: ["Advanced analytics", "Priority support"],
      limits: { products: 0, analytics: true, prioritySupport: true, ads: false },
      isActive: true,
      sortOrder: 2,
    },
    {
      code: "pro-quarterly",
      name: "Pro Quarterly",
      description: "Discounted quarterly billing",
      price: 799,
      currency: "PHP",
      interval: "quarterly",
      features: ["Advanced analytics", "Priority support"],
      limits: { products: 0, analytics: true, prioritySupport: true, ads: false },
      isActive: true,
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    await Plan.updateOne({ code: plan.code }, { $set: plan }, { upsert: true });
  }

  console.log("✅ Plans seeded");
  await mongoose.disconnect();
};

seedPlans().catch((e) => {
  console.error(e);
  process.exit(1);
});
