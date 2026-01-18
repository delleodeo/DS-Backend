// Setup in-memory MongoDB
require('../helpers/testSetup');
const supertest = require('supertest');
const app = require('../../app');
const ProductCategory = require('../../modules/products/models/productCategory.model');
const ProductMunicipality = require('../../modules/products/models/productMunicipality.model');
const productMeta = require('../../modules/products/productMeta.service');

const request = supertest(app);

describe('Product Meta routes', () => {
  beforeEach(async () => {
    await ProductCategory.deleteMany({});
    await ProductMunicipality.deleteMany({});
  });

  test('GET /v1/public/product-categories returns categories', async () => {
    await productMeta.incrementCategory('A');
    const res = await request.get('/v1/public/product-categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].name.toLowerCase()).toBe('a');
  });

  test('GET /v1/public/product-municipalities returns municipalities', async () => {
    await productMeta.incrementMunicipality('M1');
    const res = await request.get('/v1/public/product-municipalities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].name.toLowerCase()).toBe('m1');
  });
});
