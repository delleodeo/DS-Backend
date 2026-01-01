const sanitizeMongoInput = require('../../utils/sanitizeMongoInput');

describe('sanitizeMongoInput', () => {
  test('strips HTML tags from strings', () => {
    const input = '<b>Hello</b> <script>alert(1)</script>';
    const out = sanitizeMongoInput(input);
    expect(out).toBe('Hello alert(1)'.trim());
  });

  test('removes $ operators and dot keys', () => {
    const input = { name: 'Alice', $where: 'malicious', 'profile.photo': 'x' };
    const out = sanitizeMongoInput(input);
    expect(out).toHaveProperty('name', 'Alice');
    expect(out).not.toHaveProperty('$where');
    expect(out).not.toHaveProperty('profile.photo');
  });

  test('recursively sanitizes arrays and nested objects', () => {
    const input = [{ name: '<i>A</i>' }, { $ne: 'x' }, { details: { 'user.name': 'u' } }];
    const out = sanitizeMongoInput(input);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toHaveProperty('name', 'A');
    // entries that became empty objects should still exist but not contain malicious keys
    expect(out[1]).toEqual({});
    expect(out[2]).toHaveProperty('details');
    expect(out[2].details).not.toHaveProperty('user.name');
  });
});