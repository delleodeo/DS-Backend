// cart.controller.js
const {
  addToCartService,
  getCartService,
  updateCartItemService,
  removeCartItemService,
  clearCartService,
} = require("./cart.service");

exports.addToCart = async (req, res) => {
  try {
    const { item } = req.body;
    const { id } = req.user;
    const cart = await addToCartService(id, item);
    res.json({
      success: true,
      data: cart,
      message: "Item added to cart successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const { id } = req.user;
    const cart = await getCartService(id);
    res.json({
      success: true,
      data: cart,
      message: "Cart retrieved successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { item } = req.body;
    const { id } = req.user;
    const cart = await updateCartItemService(id, item);
    res.json({
      success: true,
      data: cart,
      message: "Cart item updated successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const { productId, optionId } = req.body;
    const { id } = req.user;
    const cart = await removeCartItemService(id, productId, optionId);
    res.json({
      success: true,
      data: cart,
      message: "Item removed from cart successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const { id } = req.user;
    const cart = await clearCartService(id);
    res.json({
      success: true,
      data: cart,
      message: "Cart cleared successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
