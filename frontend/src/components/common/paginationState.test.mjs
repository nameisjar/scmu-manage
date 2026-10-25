import test from 'node:test';import assert from 'node:assert/strict';
import {pageInfo,pageNumber,pageSize,pageButtons} from './paginationState.mjs';
test('pagination handles empty lists, last-page removal, and malformed URL values',()=>{
  assert.equal(pageNumber('-3'),1);assert.equal(pageNumber('NaN'),1);assert.equal(pageNumber('1000001'),1);assert.equal(pageSize('20'),10);assert.equal(pageSize('25'),25);
  assert.deepEqual(pageInfo(0,99,10),{page:1,pages:1,start:0,end:0});assert.deepEqual(pageInfo(56,6,10),{page:6,pages:6,start:51,end:56});assert.deepEqual(pageInfo(50,6,10),{page:5,pages:5,start:41,end:50});
});
test('large datasets have bounded page buttons with first/last pages and stable gaps',()=>{
  assert.deepEqual(pageButtons(1,2),[1,2]);assert.deepEqual(pageButtons(50,100),[1,'gap-48',48,49,50,51,52,'gap-100',100]);assert.ok(pageButtons(99999,100000).length<=9);
});
