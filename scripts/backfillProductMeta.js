/*
  One-off script to backfill product-based categories and municipalities from existing approved products.
  Run from project root with: node scripts/backfillProductMeta.js
*/

const mongoose = require('mongoose');
const Product = require('../modules/products/products.model');
const productMetaService = require('../modules/products/productMeta.service');
const db = require('../config/db');

(async () => {
  try {
    await db.connect();
    console.log('Connected to DB, starting backfill...');

    const cursor = Product.find({ $or: [{ isApproved: true }, { status: 'approved' }] }).cursor();
    let count = 0;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      await productMetaService.addProductMetadata(doc);
      count++;
      if (count % 100 === 0) console.log(`Processed ${count} products`);
    }

    console.log(`Backfill complete. Processed ${count} products.`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
})();
