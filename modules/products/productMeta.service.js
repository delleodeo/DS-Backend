const ProductCategory = require('./models/productCategory.model');
const ProductMunicipality = require('./models/productMunicipality.model');
const logger = require('../../utils/logger');

function _normalize(s) {
  if (!s || typeof s !== 'string') return null;
  return s.toLowerCase().trim();
}

async function incrementCategory(name) {
  const normalized = _normalize(name);
  if (!normalized) return;
  try {
    await ProductCategory.findOneAndUpdate(
      { normalized },
      { $setOnInsert: { name }, $inc: { productCount: 1 } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('[ProductMeta] incrementCategory error:', err);
    throw err;
  }
}

async function decrementCategory(name) {
  const normalized = _normalize(name);
  if (!normalized) return;
  try {
    const doc = await ProductCategory.findOneAndUpdate(
      { normalized },
      { $inc: { productCount: -1 } },
      { new: true }
    );
    if (doc && doc.productCount <= 0) {
      await ProductCategory.deleteOne({ normalized });
    }
  } catch (err) {
    logger.error('[ProductMeta] decrementCategory error:', err);
    throw err;
  }
}

async function incrementMunicipality(name) {
  const normalized = _normalize(name);
  if (!normalized) return;
  try {
    await ProductMunicipality.findOneAndUpdate(
      { normalized },
      { $setOnInsert: { name }, $inc: { productCount: 1 } },
      { upsert: true }
    );
  } catch (err) {
    logger.error('[ProductMeta] incrementMunicipality error:', err);
    throw err;
  }
}

async function decrementMunicipality(name) {
  const normalized = _normalize(name);
  if (!normalized) return;
  try {
    const doc = await ProductMunicipality.findOneAndUpdate(
      { normalized },
      { $inc: { productCount: -1 } },
      { new: true }
    );
    if (doc && doc.productCount <= 0) {
      await ProductMunicipality.deleteOne({ normalized });
    }
  } catch (err) {
    logger.error('[ProductMeta] decrementMunicipality error:', err);
    throw err;
  }
}

// Add metadata for an approved product
async function addProductMetadata(product) {
  if (!product) return;
  // Only track approved products
  if (!product.isApproved && product.status !== 'approved') return;

  const ops = [];
  if (Array.isArray(product.categories)) {
    for (const c of product.categories) {
      if (c && c.trim().length > 0) ops.push(incrementCategory(c));
    }
  }
  if (product.municipality) ops.push(incrementMunicipality(product.municipality));

  try {
    await Promise.all(ops);
  } catch (err) {
    logger.error('[ProductMeta] addProductMetadata error:', err);
    // don't throw here to avoid failing product writes
  }
}

// Remove metadata for a product that was deleted or unapproved
async function removeProductMetadata(product) {
  if (!product) return;
  // Only if it contributed before (was approved)
  if (!product.isApproved && product.status !== 'approved') return;

  const ops = [];
  if (Array.isArray(product.categories)) {
    for (const c of product.categories) {
      if (c && c.trim().length > 0) ops.push(decrementCategory(c));
    }
  }
  if (product.municipality) ops.push(decrementMunicipality(product.municipality));

  try {
    await Promise.all(ops);
  } catch (err) {
    logger.error('[ProductMeta] removeProductMetadata error:', err);
    // swallow errors
  }
}

// Handle updates: approval transitions, category diffs, municipality changes
async function handleProductUpdate(prev, updated) {
  try {
    const prevApproved = prev?.isApproved || prev?.status === 'approved';
    const updatedApproved = updated?.isApproved || updated?.status === 'approved';

    // If product became approved, add all metadata
    if (!prevApproved && updatedApproved) {
      return addProductMetadata(updated);
    }

    // If product was approved and became unapproved, remove metadata
    if (prevApproved && !updatedApproved) {
      return removeProductMetadata(prev);
    }

    // If still approved, handle diffs
    if (prevApproved && updatedApproved) {
      const prevCats = (prev.categories || []).map((c) => c && c.trim()).filter(Boolean);
      const updatedCats = (updated.categories || []).map((c) => c && c.trim()).filter(Boolean);

      const toAdd = updatedCats.filter((c) => !prevCats.includes(c));
      const toRemove = prevCats.filter((c) => !updatedCats.includes(c));

      const ops = [];
      for (const c of toAdd) ops.push(incrementCategory(c));
      for (const c of toRemove) ops.push(decrementCategory(c));

      if ((prev.municipality || '') !== (updated.municipality || '')) {
        if (updated.municipality) ops.push(incrementMunicipality(updated.municipality));
        if (prev.municipality) ops.push(decrementMunicipality(prev.municipality));
      }

      await Promise.all(ops);
    }
  } catch (err) {
    logger.error('[ProductMeta] handleProductUpdate error:', err);
  }
}

async function getCategories(limit = 0) {
  const q = ProductCategory.find({}).sort({ productCount: -1, name: 1 });
  if (limit > 0) q.limit(limit);
  return q.lean();
}

async function getMunicipalities(limit = 0) {
  const q = ProductMunicipality.find({}).sort({ productCount: -1, name: 1 });
  if (limit > 0) q.limit(limit);
  return q.lean();
}

module.exports = {
  addProductMetadata,
  removeProductMetadata,
  handleProductUpdate,
  getCategories,
  getMunicipalities,
  // exported for tests and edge usage
  incrementCategory,
  decrementCategory,
  incrementMunicipality,
  decrementMunicipality,
};
