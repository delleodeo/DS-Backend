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
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const { id } = req.user;
    console.log(id);
    const cart = await getCartService(id);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { item } = req.body;
    const { id } = req.user;
    const cart = await updateCartItemService(id, item);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const { productId, optionId } = req.body;
    const { id } = req.user;
    const cart = await removeCartItemService(id, productId, optionId);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const { id } = req.user;
    const cart = await clearCartService(id);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
