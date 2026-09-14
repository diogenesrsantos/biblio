const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginLimiter, hashPassword, validPassword } = require('../lib/auth');

test('hash de senha aceita somente a senha original', () => {
  const stored = hashPassword('uma-senha-bem-longa');
  assert.equal(validPassword('uma-senha-bem-longa', stored), true);
  assert.equal(validPassword('senha-incorreta', stored), false);
});

test('limitador bloqueia e pode ser limpo', () => {
  const limiter = createLoginLimiter({ attempts: 2, windowMs: 1000 });
  limiter.fail('cliente', 10);
  assert.equal(limiter.blocked('cliente', 20), false);
  limiter.fail('cliente', 30);
  assert.equal(limiter.blocked('cliente', 40), true);
  limiter.clear('cliente');
  assert.equal(limiter.blocked('cliente', 50), false);
});
