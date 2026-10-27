import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('./registerModel.mjs').catch(() => ({}));
test('historical BL files cannot override an explicit missing-current-document flag after deletion', () => {
 const row={documentAvailability:{billOfLading:false},files:[{category:'FINAL',filename:'older.pdf'}]};
 assert.equal(model.registerDocumentAvailability(row).billOfLading,false);
 assert.equal(model.registerDocumentAvailability({files:row.files}).billOfLading,true);
});
test('one register payload keeps version and excludes removed legacy feature data', () => {
  assert.equal(typeof model.registerPayload, 'function');
  const payload = model.registerPayload({ version: 7, billNumber: 'B-1', financials: { revenue: 999 }, register: { customerName: 'Party' }, containers: [{ number: 'C1', size: null, status: 'REGISTERED' }, { number: 'C2', size: '21', status: 'DOORING' }] });
  assert.equal(payload.version, 7); assert.equal(payload.register.dateMeaning, 'UNCONFIRMED');
  assert.equal(payload.containers, undefined); assert.equal(payload.register.customerName, undefined);
  assert.equal(payload.financials, undefined);
});
test('unified manual fields retain exact decimal strings and independent quantities', () => {
 const form={billNumber:'MINIMAL',registerAmount:'9007199254740993.21',register:{partyName:'PT A',partyText:'SCMU',reference1:'001',reference2:'002',additionalDate1:'2026-02-02',additionalDate2:'2025-01-01',additionalNotes:'Unconfirmed',quantity20:'0',quantity21:'7',quantity40:'',departureDate:'2026-03-01',arrivalDate:'2026-01-01',customerName:'Legacy',billingPartyName:'Legacy 2'},containers:[{number:'C',size:'20'}]};
 const payload=model.registerPayload(form);
 assert.equal(payload.registerAmount,'9007199254740993.21');
 assert.equal(payload.register.quantity20,0);assert.equal(payload.register.quantity21,7);assert.equal(payload.register.quantity40,null);
 assert.equal(payload.register.partyName,'PT A');assert.equal(payload.register.billingPartyName,undefined);
 assert.equal(model.registerPayload({billNumber:'B',register:{}}).registerAmount,null);
 assert.throws(()=>model.registerPayload({...form,registerAmount:'1e5'}),/Nominal/);
 assert.throws(()=>model.registerPayload({...form,register:{quantity21:'1.5'}}),/Jumlah/);
 assert.throws(()=>model.registerPayload({...form,registerAmount:1.5}),/Nominal/);
});
test('legacy and current document/archive shapes resolve without losing availability', () => {
 assert.equal(typeof model.isRegisterArchived,'function');assert.equal(typeof model.registerDocumentAvailability,'function');
 assert.equal(model.isRegisterArchived({archivedAt:'2026-01-01'}),true);assert.equal(model.isRegisterArchived({registerData:{archivedAt:'2026-01-01'}}),true);
 assert.deepEqual(model.registerDocumentAvailability({documentAvailability:{billOfLading:true,packingList:true}}),{billOfLading:true,packingList:true});
 assert.deepEqual(model.registerDocumentAvailability({documentSummary:{hasBL:true,hasPackingList:false}}),{billOfLading:true,packingList:false});
});
test('register amount formats rupiah without floating point conversion', () => {
 assert.equal(typeof model.formatRegisterAmount,'function');
 assert.equal(model.formatRegisterAmount('9007199254740993.21'),'Rp 9.007.199.254.740.993,21');
 assert.equal(model.formatRegisterAmount('0'),'Rp 0,00');assert.equal(model.formatRegisterAmount(null),'—');
 assert.equal(model.formatRegisterAmount('-1234.5'),'Rp -1.234,50');
});
