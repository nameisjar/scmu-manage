import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBatchBL, batchRow, batchOutcome } from './documentBatchModel.mjs';
test('a saved attachment in shipment trash is not a deleted file or an active recap source',()=>{
 const row=batchRow({id:'session',saved:{billIds:['bill'],fileIds:['file'],attachmentsPresent:true,trashedBillIds:['bill'],activeBillIds:[]}});
 assert.equal(row.status,'TRASHED');assert.equal(batchOutcome([row]).trashed,1);assert.deepEqual(batchOutcome([row]).billIds,[]);assert.equal(batchOutcome([row]).pending,0);
});
test('existing numbers resolve to attachments; missing, ambiguous and read-only targets stay distinct', () => {
  const targets = [{ number: 'BL1', bills: [{ id: 'existing' }] }];
  assert.equal(resolveBatchBL(targets, ' bl 1 ').kind, 'EXISTING');
  assert.equal(batchRow({ id: 'session', fields: { billNumber: 'BL1' }, targets }).action, 'ATTACH');
  assert.equal(resolveBatchBL(targets, 'BL2').kind, 'NEW');
  assert.equal(resolveBatchBL([{ number: 'BL1', bills: [{ id: 'a' }, { id: 'b' }] }], 'BL1').kind, 'AMBIGUOUS');
  assert.equal(resolveBatchBL([{ number: 'BL1', bills: [{ id: 'a', readOnly: true }] }], 'BL1').kind, 'READ_ONLY');
});
test('outcome counts distinct shipments, excludes removed files and exposes remaining work', () => {
  const rows = [
    batchRow({ id: 'a', saved: { billIds: ['new'], createdBillIds: ['new'], fileIds: ['f1'] } }),
    batchRow({ id: 'b', saved: { billIds: ['new', 'old'], attachedBillIds: ['new', 'old'], fileIds: ['f2'] } }),
    batchRow({ id: 'c', saved: { billIds: ['deleted'], fileIds: ['gone'], attachmentsPresent: false, activeBillIds: [] } }),
    batchRow({ id: 'pending' }),
  ];
  assert.equal(rows[2].status, 'REMOVED');
  assert.deepEqual(batchOutcome(rows), { saved: 2, pending: 1, removed: 1, trashed: 0, created: 1, attached: 1, billIds: ['new', 'old'],journeyIds:[] });
});
