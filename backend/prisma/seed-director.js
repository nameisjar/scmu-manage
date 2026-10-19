const { v5: uuidv5 } = require('uuid');
const { internalCompany } = require('../src/services/access');
const { submit } = require('../src/services/director');
const id = key => uuidv5(`scmu-director-demo:${key}`, uuidv5.DNS);
module.exports = async function seedDirector(prisma, admin) {
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: 'operasional@scmu.local' } }); const company = await internalCompany(prisma);
  const job = await prisma.jobOrder.upsert({ where: { jobNumber: 'SCMU-JOB-SETUJU-001' }, update: {}, create: { id: id('job'), jobNumber: 'SCMU-JOB-SETUJU-001', jobType: 'SENDER', title: 'Contoh pengajuan operasional kepada direktur', customerId: company.id, originCity: 'Surabaya', destCity: 'Merauke', cargoDescription: 'Peralatan operasional (Demo)', packages: 5, weightKg: 600, volumeCbm: 3.25, recipientName: 'Gudang tujuan Merauke (Demo)', deliveryAddress: 'Merauke, Papua Selatan', createdById: staff.id } });
  const charge = await prisma.jobCharge.upsert({ where: { id: id('fuel') }, update: {}, create: { id: id('fuel'), jobId: job.id, kind: 'COST', costSource: 'INTERNAL', costCategory: 'FUEL', description: 'Pengajuan BBM pengantaran gudang Merauke (Demo)', estimatedAmount: 750000, createdById: staff.id, notes: 'Menunggu keputusan direktur. Ini adalah data simulasi.' } });
  const document = await prisma.jobDocument.upsert({ where: { id: id('document') }, update: {}, create: { id: id('document'), jobId: job.id, type: 'PACKING_LIST', title: 'Packing list keluar untuk pemeriksaan direktur (Demo)', required: true, customerVisible: false } });
  const packing = await prisma.packingList.upsert({ where: { id: id('packing') }, update: {}, create: { id: id('packing'), jobId: job.id, documentId: document.id, direction: 'OUTBOUND', recordNumber: 'PL-SCMU-SETUJU-DEMO-001', documentDate: new Date('2026-10-19T00:00:00Z'), senderName: company.name, senderAddress: company.address, recipientName: job.recipientName, recipientAddress: job.deliveryAddress, originCity: job.originCity, destCity: job.destCity, packages: 5, netWeightKg: 550, grossWeightKg: 600, volumeCbm: 3.25, companyName: company.name, companyAddress: company.address, companyPhone: company.phone, companyEmail: company.email, createdById: staff.id, items: { create: [{ sequence: 1, description: 'Peralatan operasional (Demo)', quantity: 10, unit: 'UNIT', packages: 5, netWeightKg: 550, grossWeightKg: 600, volumeCbm: 3.25 }] } } });
  for (const [action, target, payload] of [['CHARGE_APPROVE', charge.id, { actualAmount: '750000.00' }], ['PACKING_FINALIZE', packing.id, { version: packing.version }]]) {
    if (!await prisma.directorApproval.findFirst({ where: { action, entityId: target } })) await prisma.$transaction(tx => submit(tx, staff, action, target, payload, 'Pengajuan demo dari Admin operasional. Silakan periksa sebelum memutuskan.'), { isolationLevel: 'Serializable' });
  }
  console.log('Director demo: SCMU-JOB-SETUJU-001; Admin requests, director reviews.');
};
