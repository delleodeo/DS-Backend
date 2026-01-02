const Cart = require("../modules/cart/cart.model");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

const verifyCartOwnership = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // if(!mongoose.Types.ObjectId.isValid(userId)) {
    //     return res.status(400).json({ message: "Invalid user ID" });
    // }

    if (req.method !== 'GET') {
      let cart = await Cart.findOne({ userId });

      if (!cart) {
        cart = await Cart.create({ userId, items: [] });
      }

      req.cart = cart;
    }

    next();
  } catch (error) {
    next(error);    
  }
};
module.exports = verifyCartOwnership;