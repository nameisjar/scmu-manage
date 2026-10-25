const test = require('node:test');
const assert = require('node:assert/strict');
const sea = require('../src/services/seaBills');
const register = require('../src/services/blRegister');

// In-memory persistence adapter: exercise the real service save/reload paths.
function store() {
  const state = { jobs: [], shipments: [], bills: [], documents: [], logs: [] };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object') {
      if ('not' in value) return row[key] !== value.not;
      if ('equals' in value) return String(row[key] ?? '').toLowerCase() === String(value.equals).toLowerCase();
    }
    return row[key] === value;
  });
  const model = key => ({
    create: async ({ data }) => {
      const row = { id: `${key}${state[key].length}`, version: 1, contentVersion: 1, internalStatus: 'SEA_UNCHECKED', releaseStatus: 'SEA_RELEASE_PENDING', files: [], history: [], ...data, allocations: [] };
      state[key].push(row); return row;
    },
    findUnique: async ({ where }) => state[key].find(row => matches(row, where)),
    findFirst: async ({ where }) => state[key].find(row => matches(row, where)),
    findMany: async ({ where, skip = 0, take } = {}) => state[key].filter(row => matches(row, where)).slice(skip, take ? skip + take : undefined),
    count: async ({ where }) => state[key].filter(row => matches(row, where)).length,
    update: async ({ where, data }) => {
      const row = state[key].find(row => matches(row, where));
      for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
      if (!Array.isArray(row.allocations)) row.allocations = [];
      return row;
    },
  });
  const tx = { jobOrder: model('jobs'), shipment: model('shipments'), seaBill: model('bills'), jobDocument: model('documents'), activityLog: model('logs'), company: { findUnique: async () => ({ id: 'scmu', isInternal: true, isActive: true, name: 'SCMU' }) }, packingList: { findMany: async () => [] }, seaBillCargo: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) }, seaBillRevision: { create: async () => ({}) } };
  for (const method of ['findUnique', 'findFirst']) {
    const find = tx.seaBill[method];
    tx.seaBill[method] = async query => {
      const bill = await find(query);
      if (bill) { bill.shipment = state.shipments.find(row => row.id === bill.shipmentId); bill.job = state.jobs.find(row => row.id === bill.jobId); }
      return bill;
    };
  }
  return { tx, state };
}
const staff = { id: 'staff' };

test('legacy partial operational validation uses current register context rather than stale legacy event dates', async () => {
  const { tx, state } = store();
  const saved = await register.create(tx, staff, { billNumber: 'LEGACY-CONTEXT', containers: [{ number: 'A', gateOutAt: '2026-10-01', emptyReturnedAt: '2026-10-04' }] });
  state.bills[0].containers[0].gateOutAt = '2026-10-03';
  await sea.updateBill(tx, staff, saved.jobId, saved.id, { version: 1, containers: [{ number: 'A', strippedAt: '2026-10-02', status: 'EMPTY_RETURNED' }] });
  const read = register.present(state.bills[0]);
  assert.equal(read.containers[0].strippedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(read.containers[0].status, 'EMPTY_RETURNED');
});

test('explicit legacy operational edits update registered operations without invalidating matched identity', async () => {
  const { tx, state } = store();
  const saved = await register.create(tx, staff, { billNumber: 'LEGACY-OPS', containers: [{ number: 'A', status: 'REGISTERED', driverName: 'Old' }] });
  const bill = state.bills[0];
  bill.internalStatus = 'SEA_MATCHED';
  bill.releaseStatus = 'SEA_RELEASE_CONFIRMED';
  await sea.updateBill(tx, staff, saved.jobId, saved.id, { version: 1, containers: [{ number: 'A', status: 'DOORING', driverName: 'Legacy explicit' }] });
  const read = register.present(bill);
  assert.equal(read.containers[0].status, 'DOORING');
  assert.equal(read.containers[0].driverName, 'Legacy explicit');
  assert.equal(read.internalStatus, 'SEA_MATCHED');
  assert.equal(read.releaseStatus, 'SEA_RELEASE_CONFIRMED');
});

test('historical duplicate numbers remain editable and unclaimed; new drafts allow no BL number', async () => {
  const { tx, state } = store();
  const first = await register.create(tx, staff, { billNumber: 'DUP', containers: [] });
  const second = await register.create(tx, staff, { billNumber: 'TEMP', containers: [] });
  for (const bill of state.bills) { bill.billNumber = 'DUP'; bill.registerIdentity = null; bill.registerNumber = null; }
  await sea.updateBill(tx, staff, first.jobId, first.id, { version: 1, notes: 'Historical edit' });
  await register.update(tx, staff, second.id, { version: 1, billNumber: 'DUP', notes: 'Register edit' });
  assert.equal(state.bills[0].registerIdentity, null);
  assert.equal(state.bills[1].registerIdentity, null);
  assert.equal(state.bills[0].billNumber, 'DUP');
  assert.equal(state.bills[1].billNumber, 'DUP');
  await assert.rejects(register.create(tx, staff, { billNumber: 'dup' }), error => error.status === 409);
  const draft = await sea.createBill(tx, staff, first.jobId, { shipmentId: first.shipmentId });
  assert.equal(draft.billNumber, null);
  assert.equal(draft.registerIdentity, null);
  await sea.updateBill(tx, staff, first.jobId, draft.id, { version: 1, billNumber: 'UNIQUE' });
  assert.equal(draft.registerIdentity, 'UNIQUE');
  await sea.updateBill(tx, staff, first.jobId, draft.id, { version: 2, billNumber: null });
  assert.equal(draft.registerIdentity, null);
});

test('legacy rename synchronizes register identity, releases old number and reserves new number globally', async () => {
  const { tx, state } = store();
  const saved = await register.create(tx, staff, { billNumber: 'OLD', containers: [] });
  await sea.updateBill(tx, staff, saved.jobId, saved.id, { version: 1, billNumber: ' new ' });
  assert.equal(state.bills[0].billNumber, 'new');
  assert.equal(state.bills[0].registerIdentity, 'NEW');
  const released = await register.create(tx, staff, { billNumber: 'OLD', containers: [] });
  assert.equal(released.billNumber, 'OLD');
  const writesBefore = state.bills.length;
  await assert.rejects(sea.createBill(tx, staff, released.jobId, { shipmentId: released.shipmentId, billNumber: 'NeW' }), error => error.status === 409);
  assert.equal(state.bills.length, writesBefore);
  await assert.rejects(sea.updateBill(tx, staff, released.jobId, released.id, { version: 1, billNumber: 'new' }), error => error.status === 409);
  assert.equal(state.bills[1].billNumber, 'OLD');
});

test('historical invalid operational values cannot poison aggregate reads or unrelated legacy edits', async () => {
  const { tx, state } = store();
  const saved = await register.create(tx, staff, { billNumber: 'HISTORICAL', containers: [{ number: 'A' }] });
  const bill = state.bills[0];
  bill.registerData = null;
  bill.containers = [{ number: 'A', seal: 'source', size: '45HC', status: 'DONE', gateOutAt: 'old-invalid-date', vendorName: { legacy: true }, unknown: { retained: true } }];
  const read = register.present(bill);
  assert.equal(read.containers[0].status, 'REGISTERED');
  assert.equal(read.containers[0].size, null);
  assert.equal(read.containers[0].gateOutAt, null);
  assert.deepEqual(read.containers[0].unknown, { retained: true });
  const listed = await register.list(tx);
  assert.equal(listed.summary.pendingPort, 1);
  await sea.updateBill(tx, staff, saved.jobId, saved.id, { version: 1, notes: 'Only notes' });
  assert.equal(bill.containers[0].size, '45HC');
  assert.equal(bill.containers[0].status, 'DONE');
  assert.deepEqual(bill.containers[0].unknown, { retained: true });
  await assert.rejects(sea.updateBill(tx, staff, saved.jobId, saved.id, { version: 2, containers: [{ number: 'A', status: 'DONE' }] }), error => error.status === 422);
});

test('legacy metadata and create/update reject supplied invalid operational fields before persistence', async () => {
  const invalid = [{ status: 'DONE' }, { size: '22' }, { gateOutAt: 'not-a-date' }, { status: 'EMPTY_RETURNED' }, { gateOutAt: '2026-10-03', strippedAt: '2026-10-02' }, { driverName: 'x'.repeat(2001) }];
  for (const fields of invalid) {
    assert.throws(() => sea.metadata({ containers: [{ number: 'A', ...fields }] }), error => error.status === 422);
    const { tx, state } = store();
    const bill = await register.create(tx, staff, { billNumber: 'VALIDATION', containers: [{ number: 'A' }] });
    await assert.rejects(sea.updateBill(tx, staff, bill.jobId, bill.id, { version: 1, containers: [{ number: 'A', ...fields }] }), error => error.status === 422);
    assert.equal(state.bills[0].version, 1);
    await assert.rejects(sea.createBill(tx, staff, bill.jobId, { shipmentId: bill.shipmentId, billNumber: 'OTHER', containers: [{ number: 'B', ...fields }] }), error => error.status === 422);
    assert.equal(state.bills.length, 1);
  }
  assert.throws(() => sea.metadata({ containers: [Object.assign([], { number: 'ARRAY' })] }), error => error.status === 422);
  const clean = sea.metadata({ containers: [{ number: 'A', customData: { retained: true }, status: 'DOORING', gateOutAt: '2026-10-01' }] });
  assert.deepEqual(clean.containers[0].customData, { retained: true });
  assert.equal(clean.containers[0].gateOutAt, '2026-10-01T00:00:00.000Z');
});

test('register operational save overrides stale legacy extras consistently after reload, summary and closure', async () => {
  const { tx, state } = store();
  let saved = await register.create(tx, staff, { billNumber: 'PRECEDENCE', containers: [{ number: 'A', seal: 'document-seal', driverName: 'Initial' }] });
  const bill = state.bills[0];
  bill.containers[0] = { number: 'A', seal: 'document-seal', status: 'REGISTERED', driverName: 'Legacy stale', custom: 'preserved' };
  bill.registerData.containers[0].seal = 'stale-register-seal';
  saved = await register.update(tx, staff, saved.id, { version: saved.version, containers: [{ number: 'a', status: 'EMPTY_RETURNED', emptyReturnedAt: '2026-10-02', driverName: 'Current' }] });
  assert.equal(saved.containers[0].status, 'EMPTY_RETURNED');
  assert.equal(saved.containers[0].driverName, 'Current');
  assert.equal(saved.containers[0].seal, 'document-seal');
  assert.equal(saved.containers[0].custom, 'preserved');
  saved = await register.update(tx, staff, saved.id, { version: saved.version, notes: 'Unrelated edit' });
  assert.equal(saved.containers[0].status, 'EMPTY_RETURNED');
  assert.equal(saved.containers[0].driverName, 'Current');
  const listed = await register.list(tx);
  assert.equal(listed.data[0].containers[0].status, 'EMPTY_RETURNED');
  assert.equal(listed.summary.pendingPort, 0);
  assert.equal(listed.summary.pendingEmpty, 0);
  Object.assign(bill, { internalStatus: 'SEA_MATCHED', reviewedContentVersion: 1, releaseStatus: 'SEA_RELEASE_CONFIRMED', releaseProofId: 'proof' });
  assert.doesNotThrow(() => sea.checkSeaClosure({ jobType: 'RECEIVER', shipments: [bill.shipment], seaBills: [bill] }));
  const changed = register.normalize({ containers: [{ number: 'A', seal: 'new-document-seal', driverName: 'Explicit' }] }, bill);
  assert.equal(changed.containers[0].driverName, 'Explicit');
  assert.equal(changed.containers[0].seal, 'new-document-seal');
});
