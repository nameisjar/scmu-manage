const test = require('node:test');
const assert = require('node:assert/strict');
const { submit, review } = require('../src/services/director');
const { money } = require('../src/services/jpt');

function fixture() {
  const bill = { id: 'bill', jobId: 'job', shipmentId: 'sea', billNumber: 'SPIL-BL', carrierName: 'SPIL',
    containers: [{ number: 'A', size: '20' }], registerData: { containers: [{ number: 'A', size: '20' }] }, version: 1 };
  const charges = ['DO', 'DOOR'].map((id, i) => ({ id, jobId: 'job', shipmentId: 'sea', kind: 'REVENUE', status: 'PROPOSED',
    estimatedAmount: money(i ? '3750000' : '200000'), vendor: null, description: id,
    tariffSnapshot: { billId: 'bill', line: { tariffId: id, amount: i ? '3750000.00' : '200000.00', unit: 'BL', quantity: 1, vatIncluded: true, vatRate: '1.1' } } }));
  const approvals = [];
  const tx = {
    jobOrder: { findUnique: async () => ({ id: 'job', status: 'BOOKED', jobNumber: 'JOB', jobType: 'RECEIVER', currency: 'IDR' }) },
    seaBill: { findUnique: async ({ select }) => Object.fromEntries(Object.entries(select).filter(([, value]) => value === true).map(([key]) => [key, bill[key]])) },
    jobCharge: {
      findUnique: async ({ where }) => ({ ...charges.find(row => row.id === where.id) }),
      update: async ({ where, data }) => { const row = charges.find(row => row.id === where.id); Object.assign(row, data); return row; },
    },
    directorApproval: {
      findFirst: async ({ where }) => approvals.find(row => row.scopeKey === where.scopeKey && !row.executedAt && ['SUBMITTED', 'APPROVED'].includes(row.status)),
      create: async ({ data }) => { const row = { id: `approval${approvals.length}`, status: 'SUBMITTED', ...data }; approvals.push(row); return row; },
      findUnique: async ({ where }) => approvals.find(row => row.id === where.id),
      update: async ({ where, data }) => { const row = approvals.find(row => row.id === where.id); Object.assign(row, data); return row; },
    },
    activityLog: { create: async () => ({}) },
    jptTariff: { findMany: async () => { throw new Error('Approval must never reprice from the mutable tariff master'); } },
  };
  return { tx, bill, charges, approvals };
}
const staff = { id: 'staff', role: 'ADMIN' };
const director = { id: 'director', role: 'SUPER_ADMIN' };

test('two tariff lines still approve after proposal version bumps and mutable master edits without repricing', async () => {
  const { tx, bill, charges } = fixture();
  const first = await submit(tx, staff, 'CHARGE_APPROVE', 'DO', {}, 'Explicit tariff');
  const second = await submit(tx, staff, 'CHARGE_APPROVE', 'DOOR', {}, 'Explicit tariff');
  bill.version += 1;
  // Any master lookup throws in the adapter: only frozen snapshot amounts are used.
  assert.equal((await review(tx, director, first.id, 'APPROVED')).status, 'APPROVED');
  assert.equal((await review(tx, director, second.id, 'APPROVED')).status, 'APPROVED');
  assert.deepEqual(charges.map(row => row.actualAmount.toFixed(2)), ['200000.00', '3750000.00']);
});

test('container-size eligibility changes also invalidate submitted tariff approvals', async () => {
  const { tx, bill, charges } = fixture();
  const pending = await submit(tx, staff, 'CHARGE_APPROVE', 'DOOR', {}, 'Size 20 tariff');
  bill.registerData = { containers: [{ number: 'A', size: '40' }] };
  await assert.rejects(review(tx, director, pending.id, 'APPROVED'), error => error.status === 409);
  assert.equal(charges[1].status, 'PROPOSED');
});

test('SPIL tariff approval becomes stale when current BL carrier changes to Tanto', async () => {
  const { tx, bill, charges, approvals } = fixture();
  const pending = await submit(tx, staff, 'CHARGE_APPROVE', 'DO', {}, 'SPIL tariff');
  bill.carrierName = 'Tanto';
  await assert.rejects(review(tx, director, pending.id, 'APPROVED'), error => error.status === 409 && /changed/.test(error.message));
  assert.equal(charges[0].status, 'PROPOSED');
  assert.equal(approvals[0].status, 'SUBMITTED');
});
