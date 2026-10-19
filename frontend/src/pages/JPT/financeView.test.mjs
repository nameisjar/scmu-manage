import test from 'node:test';
import assert from 'node:assert/strict';
import { financeExport, financeView } from './financeView.mjs';
const job = (id,currency,balances={}) => ({ id,jobNumber:`SCMU-${id}`,title:'Merauke',originCity:'Surabaya',destCity:'Merauke',currency,customer:{name:'SCMU'},financials:{ revenue:'1000.25',approvedCost:'300.10',internalCost:'100.05',vendorCost:'200.05',internalExpensePaid:'0.00',internalOutstanding:'0.00',grossProfit:'700.15',receivable:'0.00',payable:'0.00',...balances } });
const data = {
  jobs:[job('A','IDR',{receivable:'0.01'}),job('B','IDR',{internalOutstanding:'10.00'}),job('C','USD',{payable:'25.00'}),job('D','IDR')],
  invoices:[{id:'a',invoiceNumber:'POSTED-A',jobId:'A',jobNumber:'SCMU-A',currency:'IDR',status:'APPROVED',balance:'0.01'}, {id:'draft',jobId:'A',currency:'IDR',status:'PENDING',balance:'10000.00'}, {id:'cancelled',jobId:'A',currency:'IDR',status:'CANCELLED',balance:'10000.00'}, {id:'paid',jobId:'D',currency:'IDR',status:'PAID',balance:'0.00'}, {id:'usd',jobId:'C',currency:'USD',status:'APPROVED',balance:'25.00'}],
  payables:[{id:'vendor-idr',jobId:'A',currency:'IDR',balance:'0.00'},{id:'vendor-usd',jobId:'C',currency:'USD',balance:'25.00'}],
  internalExpenses:[{id:'internal',jobId:'B',currency:'IDR',balance:'10.00'}],alerts:[{jobId:'A',type:'INVOICE_OVERDUE'},{jobId:'D',type:'DOCUMENT_REQUIRED'},{jobId:'C',type:'INVOICE_OVERDUE'}],
};
test('financial views keep currency boundaries, posted invoices, settled rows and exact server amounts',()=>{
  const before=structuredClone(data);const view=financeView(data,{currency:'IDR'});
  assert.deepEqual(view.jobs.map(row=>row.id),['A','B','D']);assert.deepEqual(view.invoices.map(row=>row.id),['a','paid']);assert.equal(view.payables.length,1);
  assert.deepEqual(financeView(data,{currency:'IDR',outstandingOnly:true}).jobs.map(row=>row.id),['A','B']);
  assert.deepEqual(financeView(data,{currency:'IDR',outstandingOnly:true}).invoices.map(row=>row.id),['a']);
  assert.equal(financeView(data,{currency:'IDR',outstandingOnly:true}).payables.length,0);
  assert.deepEqual(data,before);assert.equal(view.jobs[0].financials.grossProfit,'700.15');
});
test('search and balance filters constrain related tables and CSV without mixing jobs or currencies',()=>{
  const view=financeView(data,{currency:'IDR',search:' scmu-a ',outstandingOnly:true});
  assert.equal(view.jobs.length,1);assert.equal(view.internal.length,0);assert.equal(view.alerts.length,1);
  const ledger=financeExport('overview',view);assert.equal(ledger.headers.length,12);assert.equal(ledger.rows.length,1);assert.equal(ledger.rows[0][3],'1000.25');
  const invoices=financeExport('receivables',view);assert.equal(invoices.rows.length,1);assert.equal(invoices.rows[0][4],'0.01');
  assert.equal(financeExport('payables',view).rows.length,0);
  assert.equal(financeView(data,{currency:'IDR',search:'not found'}).jobs.length,0);
});
