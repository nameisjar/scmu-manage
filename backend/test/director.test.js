const test = require('node:test'); const assert = require('node:assert/strict');
const { canonical, digest, review } = require('../src/services/director');
test('approval fingerprints preserve values while ignoring object key order', () => {
  assert.equal(digest({ amount:'100.00', nested:{ a:1, b:2 } }), digest({ nested:{ b:2, a:1 }, amount:'100.00' }));
  assert.notEqual(digest({ amount:'100.00' }), digest({ amount:'101.00' }));
  assert.equal(canonical({ date:new Date('2026-10-19T00:00:00Z') }), '{"date":"2026-10-19T00:00:00.000Z"}');
});
test('director decisions require a different active reviewer and a decision note for returns', async () => {
  await assert.rejects(review({}, { id:'admin', role:'ADMIN' }, 'request', 'APPROVED'), /Only the director/);
  const tx = { directorApproval: { findUnique: async () => ({ status:'SUBMITTED', requestedById:'director' }) } };
  await assert.rejects(review(tx, { id:'director', role:'SUPER_ADMIN' }, 'request', 'APPROVED'), /own request/);
  await assert.rejects(review(tx, { id:'other', role:'SUPER_ADMIN' }, 'request', 'RETURNED'), /Decision note/);
});
