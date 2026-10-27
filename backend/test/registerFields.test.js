const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('../src/services/blRegister');

test('neutral register fields preserve legacy extras and normalize optional blank values', () => {
  const before = {registerData:{legacyFlag:'keep',register:{customerName:'Legacy',billingPartyName:'Billing',unknown:'keep',partyName:'Old'}}};
  const result = register.normalize({register:{partyName:' New ',partyText:' SCMU ',reference1:'001',reference2:' ',additionalNotes:' note ',quantity20:0,quantity21:'2',quantity40:''}},before);
  assert.equal(result.register.partyName,'New');
  assert.equal(result.register.partyText,'SCMU');
  assert.equal(result.register.reference2,null);
  assert.equal(result.register.additionalNotes,'note');
  assert.equal(result.register.quantity20,0);
  assert.equal(result.register.quantity21,2);
  assert.equal(result.register.quantity40,null);
  assert.equal(result.register.customerName,undefined);
  assert.equal(result.register.billingPartyName,undefined);
  assert.equal(result.register.unknown,'keep');
  assert.equal(result.legacyFlag,'keep');
  assert.equal(result.register.amountMeaning,'UNCONFIRMED');
});

test('unconfirmed register dates are independently valid calendar dates, with nullable extra dates', () => {
  const result=register.normalize({register:{departureDate:'2026-10-02',arrivalDate:'2026-10-01',additionalDate1:'2024-02-29',additionalDate2:' '}});
  assert.equal(result.register.arrivalDate,'2026-10-01T00:00:00.000Z');
  assert.equal(result.register.additionalDate1,'2024-02-29T00:00:00.000Z');
  assert.equal(result.register.additionalDate2,null);
  for(const key of ['departureDate','arrivalDate','additionalDate1','additionalDate2']) {
    for(const value of ['2023-02-29','2023-02-31','2026-13-01','2026-04-31',true,123]) assert.throws(()=>register.normalize({register:{[key]:value}}),err=>err.status===422);
  }
  for(const value of [-1,1.5,true,{},'abc',2147483648]) assert.throws(()=>register.normalize({register:{quantity21:value}}),err=>err.status===422);
});
