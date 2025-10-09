const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String, default: "" },
    barangay: { type: String, default: "" },
    city: { type: String, default: "" },
    province: { type: String, default: "" },
    zipCode: { type: String, default: "" },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String }, 
  provider: {
    type: String,
    enum: ["local", "google", "facebook"],
    default: "local",
  },
  providerId: String, 
  phone: String,
  address: {type: AddressSchema},
  wallet: {
    cash: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 },
  },
  role: {
    type: String,
    enum: ["user", "vendor", "admin", 'rider'],
    default: "user",
  },
  isVerified: { type: Boolean, default: false },
  totalOrders: { type: Number, default: 0 },
  avatar: {type: String, defaul: "sasa"},
  createdAt: { type: Date, default: Date.now },
  acceptTos: {type: Boolean, default: false}
});

module.exports = mongoose.model("User", UserSchema);
