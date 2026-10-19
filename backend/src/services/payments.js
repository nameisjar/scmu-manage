const { mutableJob, choice, text, decimal, fail, money, sum, date, invoiceBalance, audit } = require('./jpt');
async function preparePayment(tx, jobId, body) {
  const job = await mutableJob(tx, jobId); const direction = choice(body.direction, ['RECEIVABLE', 'PAYABLE', 'INTERNAL_EXPENSE']); const amount = decimal(body.amount, 'Payment amount', 2, true);
  let invoice = null; let charge = null;
  if (direction === 'RECEIVABLE') {
    invoice = await tx.invoice.findFirst({ where: { id: text(body.invoiceId, 'Invoice ID', 100), jobId }, include: { payments: true } });
    fail(invoice && ['APPROVED', 'DISPUTED', 'PAID'].includes(invoice.status), 'Approved invoice not found', 409); fail(amount.lte(invoiceBalance(invoice)), 'Payment exceeds outstanding balance', 409);
  } else {
    charge = await tx.jobCharge.findFirst({ where: { id: text(body.chargeId, 'Charge ID', 100), jobId, kind: 'COST', status: 'APPROVED' }, include: { payments: true, vendor: { select: { name: true } } } });
    fail(charge, 'Approved cost not found', 404); fail(charge.costSource === (direction === 'INTERNAL_EXPENSE' ? 'INTERNAL' : 'VENDOR'), 'Payment direction must match the cost source');
    fail(amount.lte(money(charge.actualAmount).minus(sum(charge.payments, payment => payment.amount))), 'Payment exceeds outstanding balance', 409);
  }
  fail(body.isAdvance === undefined || typeof body.isAdvance === 'boolean', 'Advance must be true or false');
  const data = { direction, invoiceId: invoice?.id || null, chargeId: charge?.id || null, amount: amount.toFixed(2), reference: text(body.reference, 'Payment reference', 150), method: choice(body.method || 'BANK_TRANSFER', ['BANK_TRANSFER', 'CASH', 'OTHER']), paidTo: text(body.paidTo, 'Payment recipient', 200, direction !== 'INTERNAL_EXPENSE'), isAdvance: body.isAdvance ?? false };
  fail(!await tx.jobPayment.findUnique({ where: { jobId_reference_direction: { jobId, reference: data.reference, direction } } }), 'This payment reference was already recorded', 409);
  return { job, invoice, charge, data };
}
async function recordPayment(tx, user, jobId, body) {
  const prepared = await preparePayment(tx, jobId, body); const { data, invoice } = prepared;
  let approval;
  if (data.direction !== 'RECEIVABLE') {
    approval = await tx.directorApproval.findUnique({ where: { id: body.approvalId || '' } });
    fail(approval?.action === 'PAYMENT_AUTHORIZE' && approval.jobId === jobId && approval.status === 'APPROVED' && !approval.executedAt, 'A director payment authorization is required', 403);
    fail(Object.keys(data).every(key => data[key] === approval.payload[key]), 'Payment must match the director authorization', 409);
  }
  const payment = await tx.jobPayment.create({ data: { ...data, jobId, amount: decimal(data.amount), notes: text(body.notes, 'Payment proof reference / notes', 2000, data.direction === 'RECEIVABLE'), paidAt: date(body.paidAt || new Date()), createdById: user.id } });
  if (invoice) await tx.invoice.update({ where: { id: invoice.id }, data: { status: invoiceBalance(invoice).eq(data.amount) ? 'PAID' : 'APPROVED', ...(invoiceBalance(invoice).eq(data.amount) ? { paidDate: payment.paidAt } : {}) } });
  if (approval) await tx.directorApproval.update({ where: { id: approval.id }, data: { executedAt: new Date(), resultId: payment.id } });
  await audit(tx, user, 'PAYMENT_RECORDED', 'JobOrder', jobId, { paymentId: payment.id, direction: data.direction, amount: payment.amount, approvalId: approval?.id }); return payment;
}
module.exports = { preparePayment, recordPayment };
