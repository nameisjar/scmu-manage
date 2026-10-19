const { v5: uuidv5 } = require('uuid');
const { INTERNAL_COMPANY_ID } = require('../src/services/access');
const id = name => uuidv5(`scmu-jpt:${name}`, uuidv5.DNS);

module.exports = async function seedJpt(prisma, admin) {
  const day = offset => new Date(Date.now() + offset * 86400000);
  const customer = await prisma.company.findUniqueOrThrow({ where: { id: INTERNAL_COMPANY_ID } });
  const road = await prisma.company.upsert({ where: { id: id('road-vendor') }, update: {}, create: { id: id('road-vendor'), name: 'SCMU Angkutan Nusantara (Demo)', type: 'TRANSPORTER', email: 'angkutan@scmu.local', city: 'Surabaya', state: 'Jawa Timur' } });
  const sea = await prisma.company.upsert({ where: { id: id('sea-vendor') }, update: {}, create: { id: id('sea-vendor'), name: 'SCMU Pelayaran Mitra (Demo)', type: 'TRANSPORTER', email: 'pelayaran@scmu.local', city: 'Merauke', state: 'Papua Selatan' } });
  const route = await prisma.route.upsert({ where: { id: id('route-surabaya-merauke') }, update: {}, create: {
    id: id('route-surabaya-merauke'), name: 'Surabaya - Merauke (Demo)', originCity: 'Surabaya', originState: 'Jawa Timur', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 14,
  } });
  const items = [
    { description: 'Penjemputan dan handling asal', quantity: 1, unit: 'JOB', sellRate: 3000000, buyRate: 2000000 },
    { description: 'Angkutan laut', quantity: 1, unit: 'JOB', sellRate: 10000000, buyRate: 8000000 },
    { description: 'Pengantaran tujuan', quantity: 1, unit: 'JOB', sellRate: 2000000, buyRate: 2000000 },
  ];
  const cargo = { title: 'Distribusi peralatan Surabaya - Merauke', customerId: customer.id, originCity: 'Surabaya', destCity: 'Merauke', serviceType: 'DOMESTIC',
    cargoDescription: 'Peralatan operasional - data contoh untuk demo', packages: 10, weightKg: 1200, volumeCbm: 6.5, currency: 'IDR', createdById: admin.id };
  const quotation = await prisma.salesQuotation.upsert({ where: { quotationNumber: 'SCMU-SQ-DEMO-001' }, update: {}, create: { ...cargo, id: id('quotation-accepted'), quotationNumber: 'SCMU-SQ-DEMO-001',
    status: 'ACCEPTED', validUntil: day(14), plannedPickup: day(-5), expectedDelivery: day(3), terms: 'Penawaran contoh. Pembayaran 30 hari setelah invoice.', items: { create: items } } });
  await prisma.salesQuotation.upsert({ where: { quotationNumber: 'SCMU-SQ-DEMO-002' }, update: {}, create: { ...cargo, id: id('quotation-sent'), title: 'Penawaran komersial menunggu konfirmasi', quotationNumber: 'SCMU-SQ-DEMO-002',
    status: 'SENT', validUntil: day(14), terms: 'Data demo internal SCMU - konfirmasi penawaran dicatat oleh Admin.', items: { create: items } } });
  const job = await prisma.jobOrder.upsert({ where: { jobNumber: 'SCMU-JOB-DEMO-001' }, update: {}, create: { ...cargo, id: id('job'), jobNumber: 'SCMU-JOB-DEMO-001', quotationId: quotation.id,
    customerReference: 'PO-DEMO-001', status: 'IN_PROGRESS', recipientName: 'Penerima Demo Merauke', deliveryAddress: 'Alamat penerima demo, Merauke', plannedPickup: day(-5), expectedDelivery: day(3),
    notes: 'Pekerjaan domestik multimoda untuk presentasi SCMU.' } });
  for (const [index, item] of items.entries()) {
    await prisma.jobCharge.upsert({ where: { id: id(`revenue-${index}`) }, update: {}, create: { id: id(`revenue-${index}`), jobId: job.id, kind: 'REVENUE', description: item.description,
      estimatedAmount: item.sellRate, actualAmount: item.sellRate, status: 'APPROVED', createdById: admin.id, approvedById: admin.id, approvedAt: day(-5) } });
    await prisma.jobCharge.upsert({ where: { id: id(`cost-${index}`) }, update: {}, create: { id: id(`cost-${index}`), jobId: job.id, kind: 'COST', description: item.description,
      estimatedAmount: item.buyRate, actualAmount: index < 2 ? item.buyRate : null, vendorId: index === 1 ? sea.id : road.id,
      status: index < 2 ? 'APPROVED' : 'PROPOSED', createdById: admin.id, approvedById: index < 2 ? admin.id : null, approvedAt: index < 2 ? day(-5) : null, dueDate: day(7) } });
  }
  const legs = [
    { mode: 'ROAD', carrierId: road.id, originCity: 'Surabaya', destCity: 'Pelabuhan Tanjung Perak', status: 'DELIVERED', loadingDate: day(-5), expectedDelivery: day(-4), actualDelivery: day(-4) },
    { mode: 'SEA', carrierId: sea.id, originCity: 'Pelabuhan Tanjung Perak', destCity: 'Pelabuhan Merauke', status: 'IN_TRANSIT', loadingDate: day(-3), expectedDelivery: day(1), vesselFlight: 'Kapal Demo SCMU', bookingNumber: 'DEMO-BOOK-001', containerNumber: 'DEMO-CONT-001', sealNumber: 'DEMO-SEAL-001', freeUntil: day(7) },
    { mode: 'ROAD', carrierId: road.id, originCity: 'Pelabuhan Merauke', destCity: 'Merauke', status: 'PENDING', loadingDate: day(2), expectedDelivery: day(3) },
  ];
  for (const [index, leg] of legs.entries()) {
    const shipment = await prisma.shipment.upsert({ where: { shipmentNumber: `SCMU-JPT-SHP-${index + 1}` }, update: {}, create: {
      ...leg, id: id(`shipment-${index}`), shipmentNumber: `SCMU-JPT-SHP-${index + 1}`, jobId: job.id, sequence: index + 1,
      shipperCompanyId: customer.id, createdById: admin.id, originState: index < 2 ? 'Jawa Timur' : 'Papua Selatan', destState: index === 0 ? 'Jawa Timur' : 'Papua Selatan', currency: 'IDR', weight: 1.2, quantity: 10,
    } });
    if (index < 2) await prisma.trackingEvent.upsert({ where: { id: id(`tracking-${index}`) }, update: {}, create: { id: id(`tracking-${index}`), shipmentId: shipment.id,
      eventType: index === 0 ? 'DELIVERED' : 'DEPARTED', location: index === 0 ? leg.destCity : leg.originCity, recordedAt: index === 0 ? leg.actualDelivery : leg.loadingDate, notes: 'Peristiwa demo SCMU.' } });
    await prisma.jobDocument.upsert({ where: { id: id(`leg-document-${index}`) }, update: {}, create: { id: id(`leg-document-${index}`), jobId: job.id, shipmentId: shipment.id,
      title: index === 1 ? 'Bill of lading' : `Surat jalan tahap ${index + 1}`, type: index === 1 ? 'BILL_OF_LADING' : 'SURAT_JALAN', required: true } });
  }
  for (const [type, title] of [['PACKING_LIST', 'Packing list'], ['POD', 'Proof of delivery']]) await prisma.jobDocument.upsert({ where: { id: id(`document-${type}`) }, update: {}, create: { id: id(`document-${type}`), jobId: job.id, title, type, required: true } });
  const invoice = await prisma.invoice.upsert({ where: { invoiceNumber: 'SCMU-JPT-INV-001' }, update: {}, create: { id: id('invoice'), invoiceNumber: 'SCMU-JPT-INV-001', jobId: job.id, companyId: customer.id,
    freightAmount: 15000000, gstAmount: 0, totalAmount: 15000000, currency: 'IDR', status: 'APPROVED', invoiceDate: day(-3), dueDate: day(27), notes: 'Invoice demo dengan pembayaran sebagian.' } });
  for (const [index, item] of items.entries()) await prisma.invoiceItem.upsert({ where: { id: id(`invoice-item-${index}`) }, update: {}, create: { id: id(`invoice-item-${index}`), invoiceId: invoice.id, chargeId: id(`revenue-${index}`), description: item.description, amount: item.sellRate } });
  await prisma.jobPayment.upsert({ where: { id: id('customer-payment') }, update: {}, create: { id: id('customer-payment'), jobId: job.id, direction: 'RECEIVABLE', invoiceId: invoice.id, amount: 5000000, reference: 'DEMO-AR-001', method: 'BANK_TRANSFER', paidAt: day(-2), createdById: admin.id } });
  await prisma.jobPayment.upsert({ where: { id: id('vendor-payment') }, update: {}, create: { id: id('vendor-payment'), jobId: job.id, direction: 'PAYABLE', chargeId: id('cost-0'), amount: 1000000, reference: 'DEMO-AP-001', method: 'BANK_TRANSFER', isAdvance: true, paidAt: day(-4), createdById: admin.id } });
  for (const [index, status] of ['IN', 'OUT'].entries()) await prisma.jobOperation.upsert({ where: { id: id(`warehouse-${index}`) }, update: {}, create: { id: id(`warehouse-${index}`), jobId: job.id, kind: 'WAREHOUSE', status,
    reference: `DEMO-WH-${index + 1}`, location: 'Gudang Demo Surabaya', quantity: 10, eventDate: day(-6 + index), createdById: admin.id } });
  await prisma.jobOperation.upsert({ where: { id: id('insurance') }, update: {}, create: { id: id('insurance'), jobId: job.id, kind: 'INSURANCE', status: 'ACTIVE', reference: 'DEMO-POLIS-001', party: 'Mitra asuransi demo', amount: 15000000, eventDate: day(-5), expiresAt: day(30), createdById: admin.id, notes: 'Catatan polis contoh; tidak terhubung ke perusahaan asuransi.' } });
  await prisma.activityLog.upsert({ where: { id: id('job-audit') }, update: {}, create: { id: id('job-audit'), userId: admin.id, action: 'JOB_CREATED', entity: 'JobOrder', entityId: job.id, metadata: { source: 'SCMU demo seed' } } });
  console.log('Internal JPT demo: SCMU-JOB-DEMO-001');
};
