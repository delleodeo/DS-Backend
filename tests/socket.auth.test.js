const http = require('http');
const { io } = require('socket.io-client');
const app = require('../app');
const { initSocket } = require('../config/socket');

jest.mock('../auth/token', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('../auth/tokenBlacklist', () => ({
  isTokenBlacklisted: jest.fn(() => false),
}));

jest.mock('../modules/users/users.model', () => ({
  findById: jest.fn(() => ({ select: jest.fn(() => ({ name: 'Test User', imageUrl: '', role: 'user' })) })),
}));

const { verifyToken } = require('../auth/token');
const TokenBlacklist = require('../auth/tokenBlacklist');
const User = require('../modules/users/users.model');

describe('Socket.IO handshake authentication', () => {
  let server;
  let port;

  beforeAll((done) => {
    server = http.createServer(app);
    initSocket(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('rejects connection without token', (done) => {
    const url = `http://localhost:${port}`;
    const client = io(url, { transports: ['websocket'], reconnection: false, timeout: 2000 });

    client.on('connect', () => {
      client.close();
      done.fail(new Error('Should not connect without token'));
    });

    client.on('connect_error', (err) => {
      try {
        expect(err).toBeDefined();
        expect(err.message).toMatch(/Authentication required|Invalid token/);
        client.close();
        done();
      } catch (e) {
        client.close();
        done(e);
      }
    });
  });

  test('accepts connection with valid token', (done) => {
    // Mock token verification to return a decoded payload pointing to a user id
    verifyToken.mockImplementation(() => ({ id: 'mockUserId', role: 'user' }));
    // User.findById is already mocked above to return a user

    const fakeToken = 'fake.valid.token';
    const url = `http://localhost:${port}`;
    const client = io(url, { auth: { token: fakeToken }, transports: ['websocket'], reconnection: false, timeout: 2000 });

    client.on('connect', () => {
      client.close();
      done();
    });

    client.on('connect_error', (err) => {
      client.close();
      done.fail(err);
    });
  });
});
