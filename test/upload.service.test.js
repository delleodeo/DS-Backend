const { tempUploadHandler, uploadBufferToCloudinary } = require('../modules/upload/upload.service');

// Spy on the real uploadBufferToCloudinary function so we can mock its return values
const uploadModule = require('../modules/upload/upload.service');

describe('upload handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tempUploadHandler uploads single file and attaches metadata', async () => {
    const fakeResult = { secure_url: 'https://cloudinary/test.jpg', public_id: 'test123', width: 100, height: 100, format: 'jpg', bytes: 1234 };
    jest.spyOn(uploadModule, 'uploadBufferToCloudinary').mockResolvedValue(fakeResult);

    const req = { headers: {}, file: { buffer: Buffer.from('abc'), mimetype: 'image/jpeg', fieldname: 'image', size: 1024 } };
    const res = {};
    const next = jest.fn();

    const handler = tempUploadHandler;
    await handler(req, res, next);

    expect(uploadModule.uploadBufferToCloudinary).toHaveBeenCalled();
    expect(req.file.path).toBe(fakeResult.secure_url);
    expect(req.file.filename).toBe(fakeResult.public_id);
    expect(next).toHaveBeenCalled();
  });

  test('tempUploadHandler uploads multiple files and attaches metadata', async () => {
    const fakeResultA = { secure_url: 'https://cloudinary/a.jpg', public_id: 'a', width: 50, height: 50, format: 'jpg', bytes: 200 };
    const fakeResultB = { secure_url: 'https://cloudinary/b.jpg', public_id: 'b', width: 60, height: 60, format: 'jpg', bytes: 300 };
    const spy = jest.spyOn(uploadModule, 'uploadBufferToCloudinary');
    spy.mockResolvedValueOnce(fakeResultA).mockResolvedValueOnce(fakeResultB);

    const req = { headers: {}, files: [{ buffer: Buffer.from('a'), mimetype: 'image/jpeg', fieldname: 'images' }, { buffer: Buffer.from('b'), mimetype: 'image/jpeg', fieldname: 'images' }] };
    const res = {};
    const next = jest.fn();

    const handler = tempUploadHandler;
    await handler(req, res, next);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(req.files[0].path).toBe(fakeResultA.secure_url);
    expect(req.files[1].filename).toBe(fakeResultB.public_id);
    expect(next).toHaveBeenCalled();
  });
});