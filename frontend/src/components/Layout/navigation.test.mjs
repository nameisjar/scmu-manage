import test from 'node:test';
import assert from 'node:assert/strict';
import { detailModule, localPage, pageLabel, positivePage } from './navigation.mjs';

test('return navigation accepts only internal SCMU pages, including filtered sources', () => {
  for (const url of ['/','/jobs?status=BOOKED&search=Merauke','/jobs/id?tab=finance','/approvals?approvalStatus=SUBMITTED','/sales-quotations/id']) assert.equal(localPage(url), true);
  for (const url of ['https://example.com','//example.com','/\\example.com','/login','/unknown','/jobs\r\nLocation: test',null]) assert.equal(localPage(url), false);
  assert.equal(pageLabel('/approvals?approvalStatus=all'), 'Director approvals');
  assert.equal(pageLabel('/jobs/123?tab=transport'), 'Job order');
  assert.equal(detailModule('/sales-quotations/123'), 'sales-quotations');
  assert.equal(detailModule('/shipments/new'), 'shipments');
  assert.equal(detailModule('/jobs'), null);
});
test('malformed pagination falls back to the first page', () => {
  for (const value of [null,'0','-3','1.5','NaN','Infinity','9007199254740992']) assert.equal(positivePage(value),1);
  assert.equal(positivePage('2'),2);
});
