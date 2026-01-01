const { AuditService } = require('../../modules/admin/services/adminDashboard.service');
const { AuditLog } = require('../../modules/admin/models');
const User = require('../../users/users.model');

jest.mock('../../users/users.model');

describe('AuditService.log', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves admin email from User when email not provided', async () => {
    const saveMock = jest.spyOn(AuditLog.prototype, 'save').mockResolvedValue({});
    User.findById = jest.fn().mockResolvedValue({ email: 'admin@example.com' });

    await expect(AuditService.log('someAdminId', undefined, 'PRODUCT_APPROVED', 'Product', 'pid', {}, {})).resolves.toBeDefined();

    expect(User.findById).toHaveBeenCalledWith('someAdminId');
    expect(saveMock).toHaveBeenCalled();
  });

  test('falls back to adminId string when user lookup fails or has no email', async () => {
    const saveMock = jest.spyOn(AuditLog.prototype, 'save').mockResolvedValue({});
    User.findById = jest.fn().mockRejectedValue(new Error('DB failure'));

    await expect(AuditService.log('someAdminId', undefined, 'PRODUCT_APPROVED', 'Product', 'pid', {}, {})).resolves.toBeDefined();
    expect(saveMock).toHaveBeenCalled();
  });
});