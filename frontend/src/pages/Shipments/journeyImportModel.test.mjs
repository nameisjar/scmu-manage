import assert from 'node:assert/strict';
import test from 'node:test';
import {journeyGroupKey,journeyGroupPlan,journeyGroupValid} from './journeyImportModel.mjs';
test('new groups need a confirmed period and complete identity; equivalent vessel prefixes share one plan',()=>{
 const group={mode:'NEW',fields:{vesselName:'KM. TANTO SIAP',voyageNumber:'V.165',period:'2026-10',destination:'Merauke'}};
 assert(journeyGroupValid(group));assert.equal(journeyGroupKey(group),journeyGroupKey({...group,fields:{...group.fields,vesselName:'TANTO SIAP',voyageNumber:'165'}}));
 for(const value of ['',null,'2026-13','2026-1'])assert(!journeyGroupValid({...group,fields:{...group.fields,period:value}}));
 assert.notEqual(journeyGroupKey(group),journeyGroupKey({...group,fields:{...group.fields,period:'2026-11'}}));assert.notEqual(journeyGroupKey(group),journeyGroupKey({...group,fields:{...group.fields,destination:'Jayapura'}}));
 assert.deepEqual(journeyGroupPlan(group),{mode:'NEW',fields:group.fields,confirmed:true});
});
test('existing journey plans keep their reviewed identity and block archived targets',()=>{
 const group={mode:'EXISTING',targetId:'parent',candidates:[{id:'parent',identity:'hash',archived:false}]};assert(journeyGroupValid(group));
 assert.deepEqual(journeyGroupPlan(group),{mode:'EXISTING',targetId:'parent',identity:'hash',confirmed:true});
 assert(!journeyGroupValid({...group,targetId:'other'}));assert(!journeyGroupValid({...group,candidates:[{...group.candidates[0],archived:true}]}));
});
