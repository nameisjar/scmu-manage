const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { fail } = require('./jpt');

const directory = path.resolve(__dirname, '../../uploads/job-documents');
fs.mkdirSync(directory, { recursive: true });
const types = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({ destination: directory, filename: (req, file, callback) => callback(null, randomUUID() + (types[file.mimetype] || '')) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => types[file.mimetype] ? callback(null, true) : callback(Object.assign(new Error('Only PDF, JPEG, PNG and WebP files are allowed'), { status: 415 })),
}).single('file');
// Generic attachments are stored privately; only known preview formats are displayed inline.
const uploadAny = multer({
  storage: multer.diskStorage({destination:directory,filename:(req,file,done)=>{
    const suffix=path.extname(file.originalname).toLowerCase();done(null,randomUUID()+(/^[.][a-z0-9]{1,12}$/.test(suffix)?suffix:''));
  }}), limits:{fileSize:5*1024*1024,files:1,fields:10},
}).single('file');
async function validateAttachment(file){
 fail(file,'Select a document file');fail(file.size>0,'File kosong tidak dapat disimpan.');
 if(types[file.mimetype])await validateFile(file);
 else if(/\.xlsx$/i.test(file.originalname))file.mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 else file.mimetype='application/octet-stream';
}

async function validateFile(file) {
  fail(file, 'Select a document file');
  const bytes = Buffer.alloc(12);
  const handle = await fs.promises.open(file.path, 'r');
  try { await handle.read(bytes, 0, bytes.length, 0); } finally { await handle.close(); }
  const valid = file.mimetype === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : file.mimetype === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  fail(valid, 'File content does not match its document type', 415);
}
function filePath(filename) {
  fail(filename && path.basename(filename) === filename, 'Document file not found', 404);
  return path.join(directory, filename);
}
const removeFile = filename => filename ? fs.promises.unlink(filePath(filename)).catch(() => {}) : Promise.resolve();
module.exports = { upload, uploadAny, validateFile, validateAttachment, filePath, removeFile };
