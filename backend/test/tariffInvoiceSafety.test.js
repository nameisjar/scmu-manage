const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const prisma = require('../src/prisma');
const { money } = require('../src/services/jpt');
const { INTERNAL_COMPANY_ID } = require('../src/services/access');

const charge = (id, amount, vatIncluded) => ({ id, kind: 'REVENUE', status: 'APPROVED', description: id,
  actualAmount: money(amount), estimatedAmount: money(amount),
  ...(vatIncluded === undefined ? {} : { tariffSnapshot: { line: { amount, vatIncluded, vatRate: '1.1' } } }) });

async function withInvoices(charges, work) {
  const state = { invoices: [], logs: [] };
  const project = (row, query) => {
    if (!row) return null;
    const result = { ...row };
    if (!query.include?.items) delete result.items;
    else result.items = row.items.map(item => ({ ...item,
      ...(query.include.items.include?.charge ? { charge: charges.find(charge => charge.id === item.chargeId) } : {}) }));
    return result;
  };
  const tx = {
    jobOrder: { findUnique: async () => ({ id: 'job', status: 'BOOKED', customerId: INTERNAL_COMPANY_ID, currency: 'IDR' }) },
    company: { findUnique: async () => ({ id: INTERNAL_COMPANY_ID, isInternal: true, isActive: true, paymentTermsDays: 30 }) },
    jobCharge: { findMany: async () => charges },
    invoice: {
      create: async ({ data }) => {
        const row = { ...data, id: 'invoice', items: data.items.create.map((item, i) => ({ ...item, id: `item${i}` })), payments: [] };
        state.invoices.push(row); return row;
      },
      findFirst: async query => project(state.invoices.find(row => row.id === query.where.id && row.jobId === query.where.jobId), query),
      update: async ({ where, data }) => { const row = state.invoices.find(row => row.id === where.id); Object.assign(row, data); return row; },
    },
    activityLog: { create: async ({ data }) => { state.logs.push(data); return data; } },
  };
  const original = prisma.$transaction;
  prisma.$transaction = async work => work(tx);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 'staff', role: 'ADMIN' }; next(); });
  app.use('/jobs', require('../src/routes/jobs'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/jobs/job/invoices${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try { await work({ state, tx, request }); }
  finally { prisma.$transaction = original; await new Promise(resolve => server.close(resolve)); }
}

test('editing a saved draft inspects linked charge snapshots and rejects double VAT without changing persisted tax', async () => {
  await withInvoices([charge('door', '10500000', true)], async ({ request, state }) => {
    assert.equal((await request('POST', '', {})).status, 201);
    const before = JSON.stringify(state.invoices);
    const response = await request('PUT', '/invoice', { taxAmount: '115500' });
    assert.equal(response.status, 422);
    assert.match(response.body.message, /VAT-inclusive/i);
    assert.equal(JSON.stringify(state.invoices), before);
    assert.equal(state.logs.length, 1);
    assert.equal((await request('PUT', '/invoice', { notes: 'Safe draft edit' })).status, 200);
    assert.equal(state.invoices[0].gstAmount, 0);
    assert.equal(state.invoices[0].totalAmount, 10500000);
  });
});

test('notes-only edits accept persisted Decimal tax without adding tax to inclusive amounts', async () => {
  await withInvoices([charge('inclusive', '1000', true)], async ({ request, state }) => {
    assert.equal((await request('POST', '', {})).status, 201);
    state.invoices[0].gstAmount = money(0);
    assert.equal((await request('PUT', '/invoice', { notes: 'Persisted Decimal draft' })).status, 200);
    assert.equal(state.invoices[0].gstAmount, 0);
    assert.equal(state.invoices[0].totalAmount, 1000);
  });
});

test('mixed inclusive and exclusive charges reject unallocated tax on creation and draft edits', async () => {
  await withInvoices([charge('inclusive', '1000', true), charge('exclusive', '2000', false), charge('legacy', '3000')], async ({ request, state }) => {
    assert.equal((await request('POST', '', { taxAmount: '22' })).status, 422);
    assert.equal(state.invoices.length, 0);
    assert.equal((await request('POST', '', {})).status, 201);
    assert.equal(state.invoices[0].totalAmount, 6000);
    assert.equal((await request('PUT', '/invoice', { taxAmount: '22' })).status, 422);
    assert.equal(state.invoices[0].gstAmount, 0);
  });
});

test('generic invoice editor cannot bypass the job invoice tax guard', async () => {
  const originalFind = prisma.invoice.findUnique;
  const originalUpdate = prisma.invoice.update;
  let writes = 0;
  prisma.invoice.findUnique = async () => ({ id: 'invoice', jobId: 'job', status: 'PENDING', payments: [] });
  prisma.invoice.update = async () => { writes++; return {}; };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 'staff', role: 'ADMIN' }; next(); });
  app.use('/invoices', require('../src/routes/invoices'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/invoices/invoice`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gstAmount: '115500', taxAmount: '115500' }),
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /job order/i);
    assert.equal(writes, 0);
  } finally {
    prisma.invoice.findUnique = originalFind;
    prisma.invoice.update = originalUpdate;
    await new Promise(resolve => server.close(resolve));
  }
});

test('legacy and exclusively non-inclusive invoices retain their explicit tax behavior', async () => {
  for (const charges of [[charge('legacy', '1000')], [charge('exclusive', '1000', false)]]) {
    await withInvoices(charges, async ({ request, state }) => {
      const saved = await request('POST', '', { taxAmount: '11' });
      assert.equal(saved.status, 201);
      assert.equal(saved.body.totalAmount, 1011);
      assert.equal((await request('PUT', '/invoice', { taxAmount: '22' })).status, 200);
      assert.equal(state.invoices[0].gstAmount, 22);
      assert.equal(state.invoices[0].totalAmount, 1022);
    });
  }
});

test('creating an invoice rejects additional tax on VAT-inclusive tariff amounts before any write', async () => {
  await withInvoices([charge('door', '7500000', true), charge('ship', '3000000', true)], async ({ request, state }) => {
    const response = await request('POST', '', { taxAmount: '115500' });
    assert.equal(response.status, 422);
    assert.match(response.body.message, /VAT-inclusive/i);
    assert.equal(state.invoices.length, 0);
    assert.equal(state.logs.length, 0);
    const saved = await request('POST', '', { taxAmount: '0' });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.freightAmount, 10500000);
    assert.equal(saved.body.gstAmount, 0);
    assert.equal(saved.body.totalAmount, 10500000);
    assert.equal(saved.body.items.length, 2);
  });
});
