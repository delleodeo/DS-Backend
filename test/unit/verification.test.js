describe('verification mailer', () => {
  let nodemailerMock;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('verifyMailer succeeds when transporter.verify resolves', async () => {
    const nodemailer = require('nodemailer');
    const fakeTransporter = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn().mockResolvedValue({ messageId: 'ok' }) };
    nodemailer.createTransport.mockReturnValue(fakeTransporter);

    const monitoring = require('../../utils/monitoringService');
    monitoring.resetMetrics();

    const { verifyMailer } = require('../../utils/verification');
    await expect(verifyMailer()).resolves.toBe(true);

    expect(fakeTransporter.verify).toHaveBeenCalled();
    expect(monitoring.metrics.externalSuccesses['mailer-verification']).toBe(1);
  });

  test('sendVerificationEmail retries on transient failures and eventually succeeds', async () => {
    const nodemailer = require('nodemailer');
    const sendMock = jest.fn()
      .mockRejectedValueOnce(new Error('SMTP temp error'))
      .mockRejectedValueOnce(new Error('SMTP temp error 2'))
      .mockResolvedValue({ messageId: 'ok' });

    const fakeTransporter = { verify: jest.fn().mockResolvedValue(true), sendMail: sendMock };
    nodemailer.createTransport.mockReturnValue(fakeTransporter);

    const monitoring = require('../../utils/monitoringService');
    monitoring.resetMetrics();

    const { sendVerificationEmail } = require('../../utils/verification');

    await expect(sendVerificationEmail('test@example.com', '123456')).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(monitoring.metrics.externalSuccesses['mailer']).toBe(1);
    expect(monitoring.metrics.externalErrors['mailer']).toBe(2);
  });

  test('sendVerificationEmail fails after max retries and throws', async () => {
    const nodemailer = require('nodemailer');
    const sendMock = jest.fn().mockRejectedValue(new Error('SMTP permanent failure'));
    const fakeTransporter = { verify: jest.fn().mockResolvedValue(true), sendMail: sendMock };
    nodemailer.createTransport.mockReturnValue(fakeTransporter);

    const monitoring = require('../../utils/monitoringService');
    monitoring.resetMetrics();

    const { sendVerificationEmail } = require('../../utils/verification');

    await expect(sendVerificationEmail('test@example.com', '123456')).rejects.toThrow('SMTP permanent failure');

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(monitoring.metrics.externalErrors['mailer']).toBe(3);
  });
});
