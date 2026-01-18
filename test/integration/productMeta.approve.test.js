// Setup in-memory MongoDB
require('../helpers/testSetup');
const Product = require('../../modules/products/products.model');
const ProductCategory = require('../../modules/products/models/productCategory.model');
const ProductMunicipality = require('../../modules/products/models/productMunicipality.model');
const ProductManagementService = require('../../modules/admin/services/adminDashboard.service').ProductManagementService || require('../../modules/admin/services/adminDashboard.service').ProductManagementService;

describe('Product approval impacts product meta', () => {
  beforeEach(async () => {
    await ProductCategory.deleteMany({});
    await ProductMunicipality.deleteMany({});
    await Product.deleteMany({});
  });

  test('approving a product adds it to meta lists', async () => {
    const prod = await Product.create({
      vendorId: null,
      name: 'Test Prod',
      price: 10,
      municipality: 'MTest',
      categories: ['CatA', 'CatB'],
      isApproved: false,
      status: 'pending_review'
    });

    const adminId = '000000000000000000000001';
    const result = await ProductManagementService.approveProduct(prod._id, adminId, 'admin@example.com', {});

    const cats = await ProductCategory.find({}).lean();
    const muni = await ProductMunicipality.findOne({ normalized: 'mtest' }).lean();
    expect(cats.length).toBeGreaterThanOrEqual(2);
    expect(muni).toBeTruthy();
  });
});
