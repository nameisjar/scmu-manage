const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { quotationItems, quotationTotals, financials, alerts, closeJob, decimal } = require('../src/services/jpt');

test('quotation money keeps decimal precision and rejects invalid and excessive totals', () => {
  const items = quotationItems([{ description: 'Cargo', quantity: 3, sellRate: '33.35', buyRate: '20.00' }]);
  assert.deepEqual(quotationTotals({ items }), { revenue: '100.05', estimatedCost: '60.00', estimatedProfit: '40.05', marginPercent: '40.03' });
  for (const value of ['NaN', Infinity, '-1', '1.001', '', null]) assert.throws(() => decimal(value));
  assert.throws(() => quotationItems([{ description: 'Too much', quantity: 1000000, sellRate: 999999999999 }]));
});

test('job margin excludes tax, rejected charges and unpaid estimates from actual cost', () => {
  const job = { charges: [
    { kind: 'REVENUE', status: 'APPROVED', estimatedAmount: '100.05', actualAmount: '100.05', invoiceItem: { id: 'item' } },
    { kind: 'COST', status: 'APPROVED', estimatedAmount: '55.00', actualAmount: '60.00' },
    { kind: 'COST', status: 'PROPOSED', estimatedAmount: '10.00' },
    { kind: 'COST', status: 'REJECTED', estimatedAmount: '999.00' },
  ], invoices: [{ status: 'APPROVED', freightAmount: '100.05', totalAmount: '101.00', payments: [{ amount: '40.00' }] }], payments: [{ direction: 'PAYABLE', amount: '20.00' }] };
  assert.deepEqual(financials(job), { revenue: '100.05', estimatedCost: '65.00', approvedCost: '60.00', estimatedProfit: '35.05', grossProfit: '40.05', billed: '100.05', receivable: '61.00', payable: '40.00', internalCost: '0.00', vendorCost: '60.00', internalExpensePaid: '0.00', internalOutstanding: '0.00', unbilled: '0.00' });
});

test('alerts use real deadlines, required document state and invoice balance', () => {
  const past = new Date('2026-01-01'); const now = new Date('2026-02-01');
  const job = { status: 'IN_PROGRESS', shipments: [{ status: 'IN_TRANSIT', expectedDelivery: past, freeUntil: past, containerNumber: 'TEST' }], documents: [{ required: true, status: 'UPLOADED', expiresAt: past }], charges: [{ status: 'PROPOSED' }], invoices: [{ status: 'APPROVED', totalAmount: 100, dueDate: past, payments: [{ amount: 100 }] }] };
  assert.deepEqual(alerts(job, now).map(row => row.type), ['LATE_SHIPMENT', 'CONTAINER_OVERDUE', 'DOCUMENT_REQUIRED', 'DOCUMENT_EXPIRED', 'APPROVAL_REQUIRED']);
  assert.deepEqual(alerts({ ...job, status: 'CLOSED' }, now), []);
});

test('closing requires delivery, verified documents, returned containers and settled balances', async () => {
  const job = { id: 'job', status: 'DELIVERED', shipments: [], documents: [], charges: [], invoices: [], payments: [], operations: [] };
  const tx = { jobOrder: { update: async () => ({ status: 'CLOSED' }) } };
  assert.equal((await closeJob(tx, job)).status, 'CLOSED');
  for (const changes of [
    { status: 'IN_PROGRESS' },
    { documents: [{ required: true, status: 'UPLOADED' }] },
    { documents: [{ required: true, status: 'VERIFIED', expiresAt: new Date('2000-01-01') }] },
    { shipments: [{ containerNumber: 'TEST', emptyReturnedAt: null }] },
    { charges: [{ kind: 'COST', status: 'PROPOSED', estimatedAmount: new Prisma.Decimal(1) }] },
    { invoices: [{ status: 'APPROVED', totalAmount: 100, freightAmount: 100, payments: [] }] },
    { operations: [{ kind: 'WAREHOUSE', status: 'IN', quantity: 1 }] },
    { operations: [{ kind: 'CLAIM', status: 'OPEN' }] },
  ]) await assert.rejects(closeJob(tx, { ...job, ...changes }), error => error.status === 409);
});
