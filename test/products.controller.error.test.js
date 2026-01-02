jest.mock('../modules/products/products.service', () => ({
  getProductByIdService: jest.fn(),
}));

const { getProductByIdService } = require('../modules/products/products.service');
const controller = require('../modules/products/products.controller');

describe('Products Controller - error forwarding', () => {
  test('getProductByIdController forwards service errors via next', async () => {
    const error = new Error('Product not found');
    error.status = 404;
    getProductByIdService.mockRejectedValue(error);

    const req = { params: { id: '123' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await controller.getProductByIdController(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
