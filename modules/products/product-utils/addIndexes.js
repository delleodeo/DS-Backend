// Script to add performance indexes for products collection
// Run this in MongoDB shell or as a migration

db.products.createIndex({ status: 1, isDisabled: 1, createdAt: -1 });
db.products.createIndex({ status: 1, isDisabled: 1, categories: 1, createdAt: -1 });
db.products.createIndex({ status: 1, isDisabled: 1, municipality: 1, createdAt: -1 });
db.products.createIndex({ status: 1, isDisabled: 1, vendorId: 1, createdAt: -1 });
db.products.createIndex({ status: 1, isDisabled: 1, stock: 1, categories: 1, updatedAt: -1 });

// Text index for search (if not using regex)
db.products.createIndex({
  name: "text",
  description: "text",
  categories: "text"
});