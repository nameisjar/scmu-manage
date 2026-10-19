const { createHash } = require('node:crypto');
const { fail, text, transaction, audit } = require('./jpt');
const { loadAction, applyAction } = require('./directorActions');
function canonical(value) {
  value = JSON.parse(JSON.stringify(value));
  const sorted = node => Array.isArray(node) ? node.map(sorted) : node && typeof node === 'object' ? Object.fromEntries(Object.keys(node).sort().map(key => [key, sorted(node[key])])) : node;
  return JSON.stringify(sorted(value));
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const fingerprint = context => digest({ raw: context.raw, payload: context.payload });
async function submit(tx, user, action, entityId, body, note) {
  const context = await loadAction(tx, action, text(entityId, 'Approval target', 150), body);
  const scopeKey = digest(`${action}:${entityId}:${context.scopeSuffix}`);
  fail(!await tx.directorApproval.findFirst({ where: { scopeKey, status: { in: ['SUBMITTED','APPROVED'] }, executedAt: null } }), 'An open approval already exists for this request', 409);
  const approval = await tx.directorApproval.create({ data: { action, entityId, jobId: context.jobId, scopeKey, payload: context.payload, snapshot: JSON.parse(JSON.stringify(context)), fingerprint: fingerprint(context), requestedById: user.id, requestNote: text(note, 'Request note', 2000, true) } });
  await audit(tx, user, 'DIRECTOR_APPROVAL_SUBMITTED', context.jobId ? 'JobOrder' : 'DirectorApproval', context.jobId || approval.id, { approvalId: approval.id, action }); return approval;
}
async function review(tx, user, id, decision, note) {
  fail(['APPROVED','RETURNED','REJECTED'].includes(decision), 'Decision is invalid');
  fail(user.role === 'SUPER_ADMIN', 'Only the director can review approvals', 403);
  const approval = await tx.directorApproval.findUnique({ where: { id } }); fail(approval, 'Approval not found', 404);
  fail(approval.status === 'SUBMITTED', 'This approval was already reviewed', 409); fail(approval.requestedById !== user.id, 'You cannot approve your own request', 403);
  const reviewNote = text(note, 'Decision note', 2000, decision === 'APPROVED'); let result;
  if (decision === 'APPROVED') {
    const current = await loadAction(tx, approval.action, approval.entityId, approval.payload);
    fail(fingerprint(current) === approval.fingerprint, 'The submitted data changed; withdraw and submit a new request', 409);
    result = await applyAction(tx, user, approval, current);
  } else if (decision === 'REJECTED' && approval.action === 'CHARGE_APPROVE') {
    const current = await loadAction(tx, approval.action, approval.entityId, approval.payload);
    fail(fingerprint(current) === approval.fingerprint, 'The submitted data changed; withdraw and submit a new request', 409);
    const charge = await tx.jobCharge.findUnique({ where: { id: approval.entityId } }); fail(charge?.status === 'PROPOSED', 'This charge was already reviewed', 409);
    await tx.jobCharge.update({ where: { id: charge.id }, data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), actualAmount: null } });
  }
  const updated = await tx.directorApproval.update({ where: { id }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote, ...(decision === 'APPROVED' && approval.action !== 'PAYMENT_AUTHORIZE' ? { executedAt: new Date(), resultId: result?.id || null } : {}) } });
  await audit(tx, user, `DIRECTOR_APPROVAL_${decision}`, approval.jobId ? 'JobOrder' : 'DirectorApproval', approval.jobId || id, { approvalId: id, action: approval.action, note: reviewNote }); return updated;
}
module.exports = { canonical, digest, submit, review };
