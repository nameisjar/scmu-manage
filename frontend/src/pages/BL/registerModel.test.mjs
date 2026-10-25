import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('./registerModel.mjs').catch(() => ({}));
test('one BL payload keeps version, register semantics and all containers without derived financial data', () => {
  assert.equal(typeof model.registerPayload, 'function');
  const payload = model.registerPayload({ version: 7, billNumber: 'B-1', financials: { revenue: 999 }, register: { customerName: 'Party' }, containers: [{ number: 'C1', size: null, status: 'REGISTERED' }, { number: 'C2', size: '21', status: 'DOORING' }] });
  assert.equal(payload.version, 7); assert.equal(payload.register.dateMeaning, 'UNCONFIRMED');
  assert.equal(payload.containers[0].size, null); assert.equal(payload.containers[1].status, 'DOORING');
  assert.equal(payload.financials, undefined);
});
test('tariff selection rejects disabled or unconfirmed rates and never fills missing size 21', () => {
  assert.equal(typeof model.selectableTariffs,'function');
  const rows=[{id:'fork20',size:'20',enabled:true,confirmationRequired:false},{id:'fork40',size:'40',enabled:true,confirmationRequired:false},{id:'unknown',enabled:false,confirmationRequired:true},{id:'unconfirmed',enabled:true,confirmationRequired:true}];
  assert.deepEqual(model.selectableTariffs(rows,[{size:'21'}]),[]);
  assert.deepEqual(model.selectableTariffs([...rows,{id:'do',unit:'BL',enabled:true,confirmationRequired:false}],[{size:'21'}]).map(row=>row.id),['do']);
});
test('datetime editors round-trip existing UTC timestamps without changing their instant', () => {
  assert.equal(typeof model.datetimeInput,'function');assert.equal(typeof model.datetimeValue,'function');
  const instant='2026-02-10T08:30:00.000Z'; const input=model.datetimeInput(instant);
  assert.equal(model.datetimeValue(input),instant);assert.equal(model.datetimeValue(''),null);assert.equal(model.datetimeInput(null),'');
});
test('container counts preserve unknown sizes rather than guessing 20 foot', () => {
  assert.equal(typeof model.containerCounts, 'function', 'containerCounts must exist');
  assert.deepEqual(model.containerCounts([{ size: '20' }, { size: '21' }, { size: '40' }, { size: null }, {}]), { '20': 1, '21': 1, '40': 1, unknown: 2 });
});
