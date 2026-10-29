const test = require('node:test'), assert = require('node:assert/strict');
const service = require('../src/services/shipmentTrash'), register = require('../src/services/blRegister');
function store() {
  const bill = { id: 'bill', jobId: 'job', shipmentId: 'leg', documentId: 'doc', billNumber: 'BL1', registerIdentity: 'BL1', version: 1, contentVersion: 1,
    registerData: { register: { billingStatus: 'NOT_RECEIVED' }, containers: [{ number: 'CONT1', size: '20' }] }, containers: [{ number: 'CONT1', seal: 'SEAL1' }],
    files: [{ id: 'file', category: 'FINAL', filename: 'private.pdf', contentVersion: 1 }], document: { filename: 'private.pdf' }, allocations: [], history: [], internalStatus: 'SEA_UNCHECKED', releaseStatus: 'SEA_RELEASE_PENDING' };
  const job = { id: 'job', status: 'BOOKED', _count: { seaBills: 1 }, invoices: [], charges: [], payments: [], approvals: [] };
  const audit = [], revisions = [];
  const tx = {
    seaBill: { findUnique: async () => bill, findFirst: async ({where}) => where.billNumber && bill.registerData.trash ? null : bill, update: async ({ data }) => { for (const [key, value] of Object.entries(data)) bill[key] = value?.increment ? bill[key] + value.increment : value; return bill; } },
    jobOrder: { findUnique: async () => ({ ...job, seaBills: [{ registerData: bill.registerData }] }) },
    seaBillRevision: { create: async ({ data }) => { revisions.push(data); return data; } }, activityLog: { create: async ({ data }) => { audit.push(data); return data; } },
  };
  return { tx, bill, job, audit, revisions, user: { id: 'admin', name: 'Admin', role: 'ADMIN' }, body: { version: 1, reason: 'Salah input', confirmed: true } };
}
test('trash preserves documents, cargo, identity and history; restore returns the same active record', async () => {
  const { tx, bill, user, body, audit, revisions } = store();
  const source = JSON.stringify({ files: bill.files, containers: bill.containers, document: bill.document });
  const context = await service.context(tx, user, bill.id); assert(context.canDelete); assert.equal(context.summary.documents, 1);
  const result = await service.remove(tx, user, bill.id, body);
  assert.equal(result.deleted, true); assert.equal(result.version, 2); assert.equal(bill.registerIdentity,null); assert(bill.archivedAt); assert.equal(bill.registerData.trash.reason, 'Salah input');
  assert.equal(bill.registerData.trash.deletedById, 'admin'); assert.equal(JSON.stringify({ files: bill.files, containers: bill.containers, document: bill.document }), source);
  await assert.rejects(register.archive(tx, user, bill.id, { version: 2, archived: false }), /Sampah/);
  await assert.rejects(require('../src/services/jpt').mutableJob(tx, bill.jobId), /Sampah/);
  await assert.rejects(service.remove(tx, user, bill.id, { ...body, version: 2 }), /Sampah/);
  await assert.rejects(service.restore(tx, user, bill.id, { version: 1, confirmed: true }), error => error.status === 409);
  const restored = await service.restore(tx, { ...user, role: 'SUPER_ADMIN' }, bill.id, { version: 2, confirmed: true });
  assert.equal(restored.deleted, false); assert.equal(restored.archived, false); assert.equal(restored.version, 3); assert.equal(bill.registerIdentity,'BL1'); assert.equal(bill.registerData.trash, undefined);
  assert.equal(JSON.stringify({ files: bill.files, containers: bill.containers, document: bill.document }), source);
  assert.deepEqual(audit.map(row => row.action), ['SHIPMENT_TRASHED', 'SHIPMENT_RESTORED']); assert.equal(revisions.length, 2); assert.equal(audit[1].metadata.previousDeletion.reason, 'Salah input');
});
test('reason, staff authorization, confirmation and version are required before any write', async () => {
  for (const patch of [{ reason: '' }, { confirmed: false }, { version: 0 }, { version: 7 }]) {
    const { tx, bill, user, body, audit } = store(); await assert.rejects(service.remove(tx, user, bill.id, { ...body, ...patch })); assert.equal(bill.version, 1); assert.equal(audit.length, 0);
  }
  const { tx, bill, body } = store(); await assert.rejects(service.remove(tx, { id: 'x', role: 'CUSTOMER' }, bill.id, body), error => error.status === 403);
});
test('financial, processed driver, approval and shared-job dependencies are rechecked on deletion', async () => {
  const cases = [
    ['INVOICE', ({ job }) => job.invoices.push({ status: 'PENDING' })], ['CHARGE', ({ job }) => job.charges.push({ status: 'PROPOSED' })],
    ['PAYMENT', ({ job }) => job.payments.push({ reference: 'payment' })], ['DRIVER_BON', ({ bill }) => bill.registerData.driverBons = [{ status: 'ASSIGNED' }]],
    ['DRIVER_BON', ({ bill }) => bill.registerData.driverBons = [{ status: 'CANCELLED', paymentStatus: 'PAID' }]],
    ['APPROVAL', ({ job }) => job.approvals.push({ status: 'SUBMITTED' })], ['SHARED_JOB', ({ job }) => job._count.seaBills = 2],
    ['BOOK_PAID', ({ bill }) => bill.registerData.register.billingStatus = 'PAID'], ['PROCESSED', ({ job }) => job.status = 'CLOSED'],
  ];
  for (const [code, change] of cases) {
    const state = store(); assert((await service.context(state.tx, state.user, state.bill.id)).canDelete);
    change(state); const context = await service.context(state.tx, state.user, state.bill.id); assert.equal(context.canDelete, false); assert(context.blockers.some(blocker => blocker.code === code));
    await assert.rejects(service.remove(state.tx, state.user, state.bill.id, state.body), error => error.status === 409); assert.equal(state.audit.length, 0); assert.equal(state.bill.version, 1);
  }
});
test('cancelled invoice, rejected charge and unpaid draft bon are retained; archived state is restored exactly', async () => {
  const { tx, bill, user, body, job } = store();
  job.invoices.push({ status: 'CANCELLED' }); job.charges.push({ status: 'REJECTED' }); bill.registerData.driverBons = [{ status: 'DRAFT' }];
  const archivedAt = new Date('2026-10-01T00:00:00Z'); bill.archivedAt = archivedAt; bill.archivedById = 'original';
  bill.registerData.archivedAt = archivedAt.toISOString();
  await service.remove(tx, user, bill.id, body); const result = await service.restore(tx, user, bill.id, { version: 2, confirmed: true });
  assert.equal(result.archived, true); assert.equal(bill.archivedAt.toISOString(), archivedAt.toISOString()); assert.equal(bill.archivedById, 'original');
  assert.equal(bill.registerData.archivedAt, archivedAt.toISOString()); assert.equal(bill.registerData.driverBons.length, 1);
});
test('restore rejects a number now used by a replacement and succeeds once that number is free',async()=>{
 const {tx,bill,user,body,audit}=store();await service.remove(tx,user,bill.id,body);
 const replacement={id:'replacement',billNumber:'BL1',registerIdentity:'BL1'};
 let occupied=true;tx.seaBill.findFirst=async({where})=>where.billNumber?(occupied?replacement:null):bill;
 const context=await service.context(tx,user,bill.id);assert.equal(context.canRestore,false);assert.equal(context.restoreConflict.id,'replacement');
 await assert.rejects(service.restore(tx,user,bill.id,{version:2,confirmed:true}),error=>error.status===409&&/sudah digunakan pengiriman lain/.test(error.message));
 assert.equal(bill.version,2);assert.equal(bill.registerIdentity,null);assert.equal(audit.length,1);
 occupied=false;assert.equal((await service.context(tx,user,bill.id)).canRestore,true);
 const restored=await service.restore(tx,user,bill.id,{version:2,confirmed:true});assert.equal(restored.deleted,false);assert.equal(bill.registerIdentity,'BL1');
});
test('number uniqueness ignores trash but continues to reserve active and archived numbers',async()=>{
 const sea=require('../src/services/seaBills');let found=null,where;
 const tx={seaBill:{findFirst:async query=>{where=query.where;return found;}}};
 assert.equal(await sea.registerIdentity(tx,'bl1'),'BL1');assert.match(JSON.stringify(where.AND),/trash/);
 for(const archivedAt of [null,'2026-10-01']){found={id:'current',billNumber:'BL1',archivedAt};await assert.rejects(sea.registerIdentity(tx,'bl1'),error=>error.status===409);}
});
