const router = require('express').Router();
const multer = require('multer');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const prisma = require('../prisma');
const { route, transaction, fail, mutableJob } = require('../services/jpt');
const { uploadLimiter } = require('../middleware/rateLimiter');
const importer = require('../services/packingImport');
const files = require('../services/jobFiles');
const register = require('../services/blRegister');
const sea = require('../services/seaBills');

// Inherited internal-staff authentication from blRegister, deliberately separate from PDF uploads.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, done) => done(/\.xlsx$/i.test(file.originalname) ? null : Object.assign(new Error('Select an XLSX Packing List'), { status: 415 }), /\.xlsx$/i.test(file.originalname)) }).single('file');
router.post('/:id/packing-import/preview', uploadLimiter, route(async (req, res) => {
  const bill = await register.get(prisma, req.params.id);
  fail(!bill.archivedAt && !bill.registerData?.archivedAt, 'Archived register records are read-only', 409);
  await mutableJob(prisma, bill.jobId);
  await new Promise((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
  fail(req.file, 'Select an XLSX Packing List');
  await importer.readOriginal(req.file.buffer);
  const filename = randomUUID() + '.xlsx'; let saved = false;
  try {
    await fs.writeFile(files.filePath(filename), req.file.buffer, { flag: 'wx' });
    const fileId = await transaction(async tx => {
      await sea.attach(tx, req.user, bill.jobId, bill.id, { version: req.body.version, category: 'PACKING_LIST', note: 'Partner XLSX original; import pending manual review.' }, { ...req.file, filename, mimetype: importer.MIME });
      const current = await register.get(tx, bill.id);
      return current.files.find(row => row.filename === filename).id;
    });
    saved = true;
    res.status(201).json(await importer.preview(prisma, bill.id, fileId));
  } finally { if (!saved) await files.removeFile(filename); }
}));
router.post('/:id/packing-import/:fileId/preview', route(async (req, res) => res.json(await importer.preview(prisma, req.params.id, req.params.fileId))));
router.post('/:id/packing-import/apply', route(async (req, res) => res.json(await transaction(tx => importer.apply(tx, req.user, req.params.id, req.body)))));
module.exports = router;
