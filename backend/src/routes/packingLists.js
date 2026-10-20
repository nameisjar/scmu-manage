const express = require('express');
const prisma = require('../prisma');
const { authorize } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const files = require('../services/jobFiles');
const { internalCompany } = require('../services/access');
const { STAFF, route, fail, choice, number, transaction, audit, mutableJob, syncJob, text } = require('../services/jpt');
const { packingData, validateSources, requireDraft, packingInclude, packingJob, touchHeader, matchingRoute, summaryReview, requireSummaryReview, validateOriginalIdentity } = require('../services/packing');
const router = express.Router({ mergeParams: true });
router.use(authorize(...STAFF));
const recordFor = (tx, req) => tx.packingList.findFirst({ where: { id: req.params.packingId, jobId: req.params.jobId }, include: packingInclude });
async function jobFor(tx, req) { const job = await tx.jobOrder.findUnique({ where: { id: req.params.jobId } }); fail(job, 'Job order not found', 404); return job; }
router.get('/', route(async (req, res) => { await jobFor(prisma, req); res.json({ data: await prisma.packingList.findMany({ where: { jobId: req.params.jobId }, include: packingInclude, orderBy: { createdAt: 'desc' } }) }); }));
router.get('/:packingId', route(async (req, res) => { const record = await recordFor(prisma, req); fail(record, 'Packing record not found', 404); res.json(record); }));
router.post('/', (req, res, next) => req.is('multipart/form-data') ? uploadLimiter(req, res, next) : next(), route(async (req, res) => {
  // Check the job before writing a file, then check again inside the transaction.
  await mutableJob(prisma, req.params.jobId);
  let result;
  try {
    if (req.is('multipart/form-data')) {
      await new Promise((resolve, reject) => files.upload(req, res, error => error ? reject(error) : resolve()));
      await files.validateFile(req.file);
      let data;
      try { data = JSON.parse(req.body.data); } catch { fail(false, 'Packing data must be a valid JSON object'); }
      fail(data && typeof data === 'object' && !Array.isArray(data), 'Packing data must be a valid JSON object');
      req.body = data;
    }
    const direction = choice(req.body.direction, ['INBOUND', 'OUTBOUND'], 'Packing direction');
    fail(direction !== 'INBOUND' || req.file, 'Select the original packing list file');
    fail(!req.file || direction === 'INBOUND', 'Only incoming packing lists accept original files');
    result = await transaction(async tx => {
      const job = await packingJob(tx, req.params.jobId, direction); const company = await internalCompany(tx);
      const { fields, items, sourceIds } = packingData(direction, req.body, company);
      if (direction === 'INBOUND') Object.assign(fields, summaryReview({}, fields, req.body.summaryConfirmed, req.user));
      if (direction === 'INBOUND') { matchingRoute(fields, job); await validateOriginalIdentity(tx, job.id, fields); }
      await validateSources(tx, req.params.jobId, sourceIds);
      const recordNumber = number(direction === 'INBOUND' ? 'PL-ASAL' : 'PL-SCMU');
      let document = await tx.jobDocument.findFirst({ where: { jobId: req.params.jobId, type: 'PACKING_LIST', status: 'PENDING', filename: null, packingList: { is: null } }, orderBy: { createdAt: 'asc' } });
      const documentData = { title: `${direction === 'INBOUND' ? 'Original packing list' : 'SCMU packing list'} · ${recordNumber}`, required: true, customerVisible: false,
        ...(req.file ? { filename: req.file.filename, originalName: text(req.file.originalname, 'Filename', 255), mimeType: req.file.mimetype, size: req.file.size, status: 'UPLOADED', uploadedById: req.user.id, verifiedById: null } : {}) };
      document = document ? await tx.jobDocument.update({ where: { id: document.id }, data: documentData }) : await tx.jobDocument.create({ data: { ...documentData, jobId: req.params.jobId, type: 'PACKING_LIST' } });
      const record = await tx.packingList.create({ data: { ...fields, jobId: req.params.jobId, documentId: document.id, direction, recordNumber, companyName: company.name, companyAddress: company.address, companyPhone: company.phone, companyEmail: company.email, createdById: req.user.id, items: { create: items }, sources: { create: sourceIds.map(sourceId => ({ sourceId })) } }, include: packingInclude });
      await audit(tx, req.user, 'PACKING_CREATED', 'JobOrder', req.params.jobId, { packingId: record.id, direction, recordNumber });
      if (req.file) await audit(tx, req.user, 'PACKING_ORIGINAL_UPLOADED', 'JobOrder', req.params.jobId, { packingId: record.id });
      await touchHeader(tx, job.id, direction); await syncJob(tx, job.id);
      return record;
    });
  } catch (error) { if (req.file) await files.removeFile(req.file.filename); throw error; }
  res.status(201).json(result);
}));
router.put('/:packingId', route(async (req, res) => {
  const record = await transaction(async tx => {
    await mutableJob(tx, req.params.jobId); const current = await recordFor(tx, req); requireDraft(current, req.body.version);
    const job = await packingJob(tx, req.params.jobId, current.direction);
    fail(!req.body.direction || req.body.direction === current.direction, 'Packing direction cannot be changed');
    const body = { ...current, ...req.body, items: req.body.items ?? current.items, sourceIds: req.body.sourceIds ?? current.sources.map(link => link.sourceId) };
    const { fields, items, sourceIds } = packingData(current.direction, body, await internalCompany(tx), current);
    if (current.direction === 'INBOUND') Object.assign(fields, summaryReview(current, fields, req.body.summaryConfirmed, req.user));
    if (current.direction === 'INBOUND') { matchingRoute(fields, job); await validateOriginalIdentity(tx, job.id, fields, current.id); }
    await validateSources(tx, req.params.jobId, sourceIds);
    await tx.packingListItem.deleteMany({ where: { packingListId: current.id } }); await tx.packingListSource.deleteMany({ where: { packingListId: current.id } });
    const updated = await tx.packingList.update({ where: { id: current.id }, data: { ...fields, version: { increment: 1 }, items: { create: items }, sources: { create: sourceIds.map(sourceId => ({ sourceId })) } }, include: packingInclude });
    await touchHeader(tx, job.id, current.direction); await syncJob(tx, job.id);
    await audit(tx, req.user, 'PACKING_UPDATED', 'JobOrder', req.params.jobId, { packingId: current.id }); return updated;
  }); res.json(record);
}));
router.post('/:packingId/original', uploadLimiter, route(async (req, res) => {
  await mutableJob(prisma, req.params.jobId); const before = await recordFor(prisma, req);
  fail(before, 'Packing record not found', 404);
  fail(before.direction === 'INBOUND', 'Only incoming packing lists accept original files');
  fail(before.status === 'DRAFT', 'Final packing records are locked', 409);
  await packingJob(prisma, req.params.jobId, before.direction);
  // Multipart parsing must be inside cleanup handling, including oversized/rejected files.
  try {
    await new Promise((resolve, reject) => files.upload(req, res, error => error ? reject(error) : resolve())); await files.validateFile(req.file);
    const result = await transaction(async tx => {
      await mutableJob(tx, req.params.jobId); const current = await recordFor(tx, req); requireDraft(current, req.body.version);
      await packingJob(tx, req.params.jobId, current.direction);
      await tx.jobDocument.update({ where: { id: current.documentId }, data: { filename: req.file.filename, originalName: text(req.file.originalname, 'Filename', 255), mimeType: req.file.mimetype, size: req.file.size, status: 'UPLOADED', uploadedById: req.user.id, verifiedById: null } });
      const updated = await tx.packingList.update({ where: { id: current.id }, data: { version: { increment: 1 }, summaryCheckedAt: null, summaryCheckedById: null }, include: packingInclude });
      await touchHeader(tx, current.jobId, current.direction); await syncJob(tx, current.jobId);
      await audit(tx, req.user, 'PACKING_ORIGINAL_UPLOADED', 'JobOrder', req.params.jobId, { packingId: current.id }); return { record: updated, oldFilename: current.document.filename };
    });
    await files.removeFile(result.oldFilename); res.json(result.record);
  } catch (error) { if (req.file) await files.removeFile(req.file.filename); throw error; }
}));
router.post('/:packingId/finalize', route(async (req, res) => {
  const record = await transaction(async tx => {
    await mutableJob(tx, req.params.jobId); const current = await recordFor(tx, req); requireDraft(current, req.body.version);
    await packingJob(tx, req.params.jobId, current.direction);
    if (current.direction === 'INBOUND') {
      requireSummaryReview(current);
      fail(current.receiptStatus !== 'DISCREPANCY', 'Submit receipt discrepancies for director approval', 403);
      fail(current.document.filename, 'Attach the original packing list before finalizing', 409);
      fail(current.receiptStatus !== 'PENDING', 'Record the receipt result before finalizing', 409);
    } else {
      fail(false, 'Submit this action for director approval', 403);
    }
    await tx.jobDocument.update({ where: { id: current.documentId }, data: { status: 'VERIFIED', verifiedById: req.user.id } });
    const updated = await tx.packingList.update({ where: { id: current.id }, data: { status: 'FINAL', finalizedAt: new Date(), finalizedById: req.user.id, version: { increment: 1 } }, include: packingInclude });
    await touchHeader(tx, current.jobId, current.direction); await syncJob(tx, current.jobId);
    await audit(tx, req.user, 'PACKING_FINALIZED', 'JobOrder', req.params.jobId, { packingId: current.id, direction: current.direction }); return updated;
  }); res.json(record);
}));
router.delete('/:packingId', route(async (req, res) => {
  const filename = await transaction(async tx => {
    await mutableJob(tx, req.params.jobId); const current = await recordFor(tx, req); requireDraft(current, req.body.version);
    await packingJob(tx, req.params.jobId, current.direction);
    fail(!await tx.seaBillCargo.count({ where: { packingListId: current.id } }), 'Remove this packing list from its BL cargo links before deleting', 409);
    await tx.packingList.delete({ where: { id: current.id } }); await tx.jobDocument.delete({ where: { id: current.documentId } });
    if (!await tx.jobDocument.count({ where: { jobId: req.params.jobId, type: 'PACKING_LIST' } })) await tx.jobDocument.create({ data: { jobId: req.params.jobId, type: 'PACKING_LIST', title: 'Packing list', required: true, customerVisible: false } });
    await touchHeader(tx, current.jobId, current.direction); await syncJob(tx, current.jobId);
    await audit(tx, req.user, 'PACKING_DRAFT_DELETED', 'JobOrder', req.params.jobId, { packingId: current.id }); return current.document.filename;
  }); await files.removeFile(filename); res.json({ message: 'Draft removed' });
}));
module.exports = router;
