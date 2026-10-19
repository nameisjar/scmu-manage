const { v5: uuidv5 } = require('uuid');
const { INTERNAL_COMPANY_ID } = require('../src/services/access');
const id = name => uuidv5(`scmu-own-fleet:${name}`, uuidv5.DNS);
// Create-only demo data: rerunning the seed never changes an existing trip or payment.
module.exports = async function seedOwnFleet(prisma, admin) {
  const day = offset => new Date(Date.now() + offset * 86400000);
  const sea = await prisma.company.findUniqueOrThrow({ where: { id: uuidv5('scmu-jpt:sea-vendor', uuidv5.DNS) } });
  const assets = [];
  for (const [index, city] of ['Surabaya', 'Merauke'].entries()) {
    const vehicle = await prisma.vehicle.upsert({ where: { id: id(`vehicle-${index}`) }, update: {}, create: { id: id(`vehicle-${index}`), registrationNo: index ? 'PA 9101 SM' : 'L 9101 SM', type: 'TRUCK', make: 'Hino', model: 'Ranger (Demo SCMU)', capacity: 8, companyId: INTERNAL_COMPANY_ID } });
    const driver = await prisma.driver.upsert({ where: { id: id(`driver-${index}`) }, update: {}, create: { id: id(`driver-${index}`), name: index ? 'Yohan - SCMU Merauke (Demo)' : 'Budi - SCMU Surabaya (Demo)', phone: `08120000030${index + 1}`, licenseNo: `SIM-SCMU-DEMO-${index + 1}`, city, state: index ? 'Papua Selatan' : 'Jawa Timur', companyId: INTERNAL_COMPANY_ID, licenseExpiry: day(365) } });
    assets.push({ vehicle, driver });
  }
  const job = await prisma.jobOrder.upsert({ where: { jobNumber: 'SCMU-JOB-ARMADA-001' }, update: {}, create: { id: id('job'), jobNumber: 'SCMU-JOB-ARMADA-001', title: 'Armada SCMU dan kapal mitra: Surabaya - Merauke', customerId: INTERNAL_COMPANY_ID, originCity: 'Surabaya', destCity: 'Merauke', cargoDescription: 'Peralatan operasional - simulasi armada sendiri dan vendor laut', packages: 10, weightKg: 1200, volumeCbm: 6.5, currency: 'IDR', recipientName: 'Penerima Demo Merauke', deliveryAddress: 'Gudang tujuan demo, Merauke', status: 'IN_PROGRESS', createdById: admin.id, expectedDelivery: day(5), notes: 'Tahap darat memakai armada SCMU. Tahap laut memakai vendor. Seluruh identitas dan nilai adalah simulasi.' } });
  const legs = [
    { mode: 'ROAD', transportSource: 'INTERNAL', vehicleId: assets[0].vehicle.id, driverId: assets[0].driver.id, originCity: 'Surabaya', destCity: 'Pelabuhan Tanjung Perak', status: 'DELIVERED', loadingDate: day(-4), actualDelivery: day(-4), expectedDelivery: day(-3) },
    { mode: 'SEA', transportSource: 'EXTERNAL', carrierId: sea.id, originCity: 'Pelabuhan Tanjung Perak', destCity: 'Pelabuhan Merauke', status: 'IN_TRANSIT', loadingDate: day(-2), expectedDelivery: day(3), bookingNumber: 'BOOK-ARMADA-DEMO-001', vesselFlight: 'Kapal Mitra Demo' },
    { mode: 'ROAD', transportSource: 'INTERNAL', vehicleId: assets[1].vehicle.id, driverId: assets[1].driver.id, originCity: 'Pelabuhan Merauke', destCity: 'Merauke', status: 'PENDING', loadingDate: day(4), expectedDelivery: day(5) },
  ];
  for (const [index, leg] of legs.entries()) {
    await prisma.shipment.upsert({ where: { id: id(`leg-${index}`) }, update: {}, create: { ...leg, id: id(`leg-${index}`), shipmentNumber: `SCMU-ARMADA-SHP-${index + 1}`, jobId: job.id, sequence: index + 1, shipperCompanyId: INTERNAL_COMPANY_ID, originState: index < 2 ? 'Jawa Timur' : 'Papua Selatan', destState: index ? 'Papua Selatan' : 'Jawa Timur', currency: 'IDR', weight: 1.2, quantity: 10, createdById: admin.id } });
    await prisma.jobDocument.upsert({ where: { id: id(`doc-${index}`) }, update: {}, create: { id: id(`doc-${index}`), jobId: job.id, shipmentId: id(`leg-${index}`), type: index === 1 ? 'BILL_OF_LADING' : 'SURAT_JALAN', title: index === 1 ? 'Bill of lading kapal mitra' : `Surat jalan armada SCMU tahap ${index + 1}`, required: true, customerVisible: false } });
    if (index < 2) await prisma.trackingEvent.upsert({ where: { id: id(`track-${index}`) }, update: {}, create: { id: id(`track-${index}`), shipmentId: id(`leg-${index}`), eventType: index ? 'DEPARTED' : 'DELIVERED', location: index ? leg.originCity : leg.destCity, recordedAt: day(index ? -2 : -4) } });
  }
  await prisma.jobDocument.upsert({ where: { id: id('pod') }, update: {}, create: { id: id('pod'), jobId: job.id, type: 'POD', title: 'Proof of delivery', required: true, customerVisible: false } });
  const revenue = await prisma.jobCharge.upsert({ where: { id: id('revenue') }, update: {}, create: { id: id('revenue'), jobId: job.id, kind: 'REVENUE', description: 'Jasa pengiriman Surabaya - Merauke', estimatedAmount: 15000000, actualAmount: 15000000, status: 'APPROVED', createdById: admin.id, approvedById: admin.id, approvedAt: day(-4) } });
  for (const [index] of legs.entries()) await prisma.jobCharge.upsert({ where: { id: id(`cost-${index}`) }, update: {}, create: { id: id(`cost-${index}`), jobId: job.id, shipmentId: id(`leg-${index}`), kind: 'COST', costSource: index === 1 ? 'VENDOR' : 'INTERNAL', costCategory: index === 1 ? 'FREIGHT' : 'FUEL', vendorId: index === 1 ? sea.id : null, description: index === 1 ? 'Ongkos kapal mitra' : `BBM dan perjalanan armada SCMU tahap ${index + 1}`, estimatedAmount: index === 1 ? 8000000 : 1000000, actualAmount: index === 1 ? 8000000 : 1000000, status: 'APPROVED', dueDate: day(10), createdById: admin.id, approvedById: admin.id, approvedAt: day(-4) } });
  const invoice = await prisma.invoice.upsert({ where: { id: id('invoice') }, update: {}, create: { id: id('invoice'), invoiceNumber: 'SCMU-ARMADA-INV-001', jobId: job.id, companyId: INTERNAL_COMPANY_ID, freightAmount: 15000000, gstAmount: 0, totalAmount: 15000000, currency: 'IDR', status: 'APPROVED', invoiceDate: day(-3), dueDate: day(27), items: { create: [{ chargeId: revenue.id, description: revenue.description, amount: 15000000 }] } } });
  const payments = [
    { direction: 'RECEIVABLE', invoiceId: invoice.id, amount: 5000000, reference: 'ARMADA-AR-001', method: 'BANK_TRANSFER' },
    { direction: 'PAYABLE', chargeId: id('cost-1'), amount: 1000000, reference: 'ARMADA-VENDOR-DP-001', method: 'BANK_TRANSFER' },
    { direction: 'INTERNAL_EXPENSE', chargeId: id('cost-0'), amount: 500000, reference: 'ARMADA-KAS-001', method: 'CASH', paidTo: assets[0].driver.name, notes: 'Pembayaran sebagian biaya perjalanan yang disetujui.' },
  ];
  for (const payment of payments) await prisma.jobPayment.upsert({ where: { id: id(payment.reference) }, update: {}, create: { ...payment, id: id(payment.reference), jobId: job.id, paidAt: day(-2), isAdvance: true, createdById: admin.id } });
  console.log('Own fleet + vendor demo: SCMU-JOB-ARMADA-001');
};
