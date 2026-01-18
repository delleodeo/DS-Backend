const productMeta = require('../../modules/products/productMeta.service');
const ProductCategory = require('../../modules/products/models/productCategory.model');
const ProductMunicipality = require('../../modules/products/models/productMunicipality.model');

describe('ProductMeta Service', () => {
  afterEach(async () => {
    await ProductCategory.deleteMany({});
    await ProductMunicipality.deleteMany({});
  });

  test('increment and decrement category works and removes when count zero', async () => {
    await productMeta.incrementCategory('Fruits');
    let doc = await ProductCategory.findOne({ normalized: 'fruits' }).lean();
    expect(doc).toBeTruthy();
    expect(doc.productCount).toBe(1);

    await productMeta.incrementCategory('Fruits');
    doc = await ProductCategory.findOne({ normalized: 'fruits' }).lean();
    expect(doc.productCount).toBe(2);

    await productMeta.decrementCategory('Fruits');
    doc = await ProductCategory.findOne({ normalized: 'fruits' }).lean();
    expect(doc.productCount).toBe(1);

    await productMeta.decrementCategory('Fruits');
    doc = await ProductCategory.findOne({ normalized: 'fruits' }).lean();
    expect(doc).toBeFalsy();
  });

  test('addProductMetadata adds categories and municipality for approved product', async () => {
    const product = {
      isApproved: true,
      categories: ['Veggies', 'Fruits'],
      municipality: 'Baco'
    };

    await productMeta.addProductMetadata(product);

    const cats = await ProductCategory.find({}).lean();
    expect(cats.length).toBe(2);
    const muni = await ProductMunicipality.findOne({ normalized: 'baco' }).lean();
    expect(muni).toBeTruthy();
  });

  test('removeProductMetadata decrements and removes', async () => {
    const product = {
      isApproved: true,
      categories: ['C1', 'C2'],
      municipality: 'M1'
    };
    await productMeta.addProductMetadata(product);
    await productMeta.removeProductMetadata(product);

    const cats = await ProductCategory.find({}).lean();
    expect(cats.length).toBe(0);
    const muni = await ProductMunicipality.findOne({ normalized: 'm1' }).lean();
    expect(muni).toBeFalsy();
  });
});
