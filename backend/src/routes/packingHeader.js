const express = require('express');
const prisma = require('../prisma');
const { internalCompany } = require('../services/access');
const { route, fail, transaction, number, audit, mutableJob, syncJob } = require('../services/jpt');
const { headerInclude, presentHeader, requireHeaderDraft, headerData } = require('../services/packingHeader');
const router = express.Router({ mergeParams: true });
const getHeader = (tx, jobId) => tx.packingHeader.findUnique({ where: { jobId }, include: headerInclude });
async function receivingJob(tx, jobId) {
  const job = await mutableJob(tx, jobId); fail(job.jobType === 'RECEIVER', 'Packing headers are only for receiving jobs', 409); return job;
}
router.get('/', route(async (req, res) => {
  fail(await prisma.jobOrder.findUnique({ where: { id: req.params.jobId } }), 'Job order not found', 404);
  res.json({ data: presentHeader(await getHeader(prisma, req.params.jobId)) });
}));
router.post('/', route(async (req, res) => {
  const header = await transaction(async tx => {
    const job = await receivingJob(tx, req.params.jobId);
    fail(!await getHeader(tx, job.id), 'This receiving job already has a packing header', 409);
    const { ids, fields } = await headerData(tx, job, req.body); const company = await internalCompany(tx);
    const created = await tx.packingHeader.create({ data: { ...fields, jobId: job.id, headerNumber: number('KPL-SCMU'), originCity: job.originCity, destCity: job.destCity, companyName: company.name, companyAddress: company.address, companyPhone: company.phone, companyEmail: company.email, createdById: req.user.id, packingLists: { connect: ids.map(id => ({ id })) } }, include: headerInclude });
    await syncJob(tx, job.id); await audit(tx, req.user, 'PACKING_HEADER_CREATED', 'JobOrder', job.id, { headerId: created.id, packingListIds: ids }); return created;
  }); res.status(201).json(presentHeader(header));
}));
router.put('/', route(async (req, res) => {
  const header = await transaction(async tx => {
    const job = await receivingJob(tx, req.params.jobId); const current = await getHeader(tx, job.id); requireHeaderDraft(current, req.body.version);
    const { ids, fields } = await headerData(tx, job, req.body, current);
    await tx.packingList.updateMany({ where: { headerId: current.id }, data: { headerId: null } });
    const updated = await tx.packingHeader.update({ where: { id: current.id }, data: { ...fields, version: { increment: 1 }, packingLists: { connect: ids.map(id => ({ id })) } }, include: headerInclude });
    await syncJob(tx, job.id); await audit(tx, req.user, 'PACKING_HEADER_UPDATED', 'JobOrder', job.id, { headerId: current.id, packingListIds: ids }); return updated;
  }); res.json(presentHeader(header));
}));
router.post('/finalize', route(async () => fail(false, 'Submit this action for director approval', 403)));

router.delete('/', route(async (req, res) => {
  await transaction(async tx => {
    const job = await receivingJob(tx, req.params.jobId); const header = await getHeader(tx, job.id); requireHeaderDraft(header, req.body.version);
    await tx.packingHeader.delete({ where: { id: header.id } }); await syncJob(tx, job.id);
    await audit(tx, req.user, 'PACKING_HEADER_DELETED', 'JobOrder', job.id, { headerId: header.id });
  }); res.json({ message: 'Draft removed' });
}));
module.exports = router;
