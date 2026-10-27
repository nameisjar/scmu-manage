const router = require('express').Router();
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const prisma = require('../prisma');
const { route, transaction, fail } = require('../services/jpt');
const header = require('../services/registerPackingHeader');
const files = require('../services/jobFiles');

router.post('/packing-headers/preview', route(async (req, res) => res.json((await header.read(prisma, req.body.selection, req.body.headerNumber)).data)));
router.post('/packing-headers', route(async (req, res) => {
  fail(req.body.confirmed === true, 'Review and confirm the Packing Header first');
  const { data } = await header.read(prisma, req.body.selection, req.body.headerNumber);
  fail(!data.warnings.length || req.body.acceptWarnings === true, 'Review and acknowledge the Packing Header warnings');
  const buffer = await (await header.workbook(data)).xlsx.writeBuffer();
  const filename = randomUUID() + '.xlsx'; let saved = false;
  try {
    await fs.writeFile(files.filePath(filename), buffer, { flag: 'wx' });
    await transaction(tx => header.save(tx, req.user, { ...req.body, headerNumber: data.headerNumber }, filename, buffer.length, data));
    saved = true;
    res.setHeader('Content-Type', require('../services/packingImport').MIME);
    res.attachment(`${data.headerNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`);
    res.send(Buffer.from(buffer));
  } finally { if (!saved) await files.removeFile(filename); }
}));
module.exports = router;
