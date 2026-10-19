const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { createApiLimiter, createAuthLimiter } = require('../src/middleware/rateLimiter');

async function testServer(t) {
  const app = express();
  const router = express.Router();
  app.use(express.json());
  app.use('/api', createApiLimiter({ max: 2 }));
  router.post('/login', createAuthLimiter({ max: 2 }), (req, res) => {
    res.status(req.body.valid ? 200 : 401).json({ authenticated: Boolean(req.body.valid) });
  });
  router.post('/change-password', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', router);
  app.get('/api/data', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
}

test('an exhausted API quota does not block login, while failed logins stay limited', async t => {
  const request = await testServer(t);
  assert.equal((await request('/data')).status, 200);
  assert.equal((await request('/data')).status, 200);
  const blocked = await request('/data');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.message, 'Too many requests, please try again later.');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  for (const path of ['/auth/login', '/auth/login/', '/auth/login?next=dashboard']) {
    assert.equal((await request(path, { valid: true })).status, 200);
  }
  assert.equal((await request('/auth/change-password', { valid: true })).status, 429);
  assert.equal((await request('/auth/login', { valid: false })).status, 401);
  assert.equal((await request('/auth/login', { valid: false })).status, 401);
  const failed = await request('/auth/login', { valid: false });
  assert.equal(failed.status, 429);
  assert.equal(failed.data.message, 'Too many login attempts, please try again in 15 minutes.');
  assert.ok(Number(failed.headers.get('retry-after')) > 0);
});

test('successful logins do not consume the failed-password budget', async t => {
  const request = await testServer(t);
  for (let count = 0; count < 5; count++) {
    assert.equal((await request('/auth/login', { valid: true })).status, 200);
  }
  assert.equal((await request('/auth/login', { valid: false })).status, 401);
  assert.equal((await request('/auth/login', { valid: false })).status, 401);
  assert.equal((await request('/auth/login', { valid: false })).status, 429);
});
