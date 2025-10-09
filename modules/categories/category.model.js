const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  category: { type: [string] },
});


module.exports = mongoose.model("Category", categorySchema)