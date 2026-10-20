require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const data = require('./demo-indonesia');
const prisma = new PrismaClient();
const day = offset => new Date(Date.now() + offset * 86400000);

async function legacyId(model, oldId) {
  const id = data.demoId(oldId);
  if (await model.findUnique({ where: { id: oldId } })) await model.update({ where: { id: oldId }, data: { id } });
  return id;
}
async function main() {
  console.log('Seeding SCMU Indonesia / Merauke demo database...');
  for (const [index, company] of data.companies.entries()) {
    await legacyId(prisma.company, ['seed-company-001', 'seed-trans-001', 'seed-trans-002'][index]);
    await prisma.company.upsert({ where: { id: company.id }, update: {}, create: company });
  }
  const admin = await prisma.user.upsert({ where: { email: 'admin@scmu.local' }, update: {}, create: { name: 'SCMU Admin', email: 'admin@scmu.local', password: await bcrypt.hash('Admin@1234', 10), role: 'SUPER_ADMIN', companyId: data.companies[0].id } });
  const operationsAdmin = await prisma.user.upsert({ where: { email: 'operasional@scmu.local' }, update: {}, create: { name: 'Admin Operasional SCMU', email: 'operasional@scmu.local', password: await bcrypt.hash('Ops@1234', 10), role: 'ADMIN', companyId: data.companies[0].id } });
  // Region conversion is complete in existing demos; fresh seeds already use Indonesian data.
  for (const [index, [, name]] of data.goods.entries()) await prisma.goodsType.upsert({ where: { name }, update: {}, create: { id: data.demoId(`goods-indonesia-${index}`), name, isHazardous: name === 'Bahan Kimia' } });
  for (const { legacyId, mode, ...route } of data.routes) await prisma.route.upsert({ where: { id: route.id }, update: {}, create: route });
  const vehicles = [];
  for (const [index, { legacyRegistration, companyIndex, ...vehicle }] of data.vehicles.entries()) vehicles.push(await prisma.vehicle.upsert({ where: { registrationNo: vehicle.registrationNo }, update: {}, create: { ...vehicle, id: data.demoId(`vehicle-indonesia-${index}`), companyId: data.companies[companyIndex].id, insuranceExpiry: day(365), pucExpiry: day(180) } }));
  const drivers = [];
  for (const [index, { legacyPhone, companyIndex, ...driver }] of data.drivers.entries()) drivers.push(await prisma.driver.upsert({ where: { phone: driver.phone }, update: {}, create: { ...driver, id: data.demoId(`driver-indonesia-${index}`), companyId: data.companies[companyIndex].id, licenseExpiry: day(730) } }));
  const goods = await prisma.goodsType.findUnique({ where: { name: 'Kargo Umum' } });
  const shipments = [];
  for (const [index, status] of ['IN_TRANSIT', 'ASSIGNED', 'DELIVERED', 'DELIVERED', 'PENDING', 'COMPLETED'].entries()) {
    const route = data.routes[index % data.routes.length]; const id = await legacyId(prisma.shipment, `scmu-demo-shipment-${index + 1}`);
    const delivered = ['DELIVERED', 'COMPLETED'].includes(status);
    const shipment = await prisma.shipment.upsert({ where: { shipmentNumber: `SCMU-SHP-${String(index + 1).padStart(3, '0')}` }, update: {}, create: {
      id, shipmentNumber: `SCMU-SHP-${String(index + 1).padStart(3, '0')}`, shipperCompanyId: data.companies[0].id, createdById: admin.id, routeId: route.id,
      originCity: route.originCity, originState: route.originState, destCity: 'Merauke', destState: 'Papua Selatan', mode: route.mode, goodsTypeId: goods.id,
      vehicleId: status === 'PENDING' ? null : vehicles[index % vehicles.length].id, driverId: status === 'PENDING' ? null : drivers[index % drivers.length].id,
      weight: 8 + index, quantity: 1, freightAmount: data.shipmentFreight(index), currency: 'IDR',
      loadingDate: day(delivered ? -route.estimatedDays - 1 : index === 1 || index === 4 ? 1 : -2), expectedDelivery: day(delivered ? -1 : route.estimatedDays), actualDelivery: delivered ? day(-1) : null,
      status, createdAt: day(-6 + index / 10), notes: 'Pengiriman contoh SCMU ke Merauke. Harga dan waktu merupakan simulasi demo.',
    } });
    shipments.push(shipment);
    if (!['PENDING', 'ASSIGNED'].includes(status)) {
      await prisma.trackingEvent.upsert({ where: { id: `scmu-demo-departure-${index + 1}` }, update: {}, create: { id: `scmu-demo-departure-${index + 1}`, shipmentId: shipment.id, eventType: 'DEPARTED', location: `Gudang Demo ${route.originCity}`, city: route.originCity, state: route.originState, recordedAt: shipment.loadingDate, notes: 'Keberangkatan pengiriman demo SCMU.' } });
      if (shipment.actualDelivery) await prisma.trackingEvent.upsert({ where: { id: `scmu-demo-delivery-${index + 1}` }, update: {}, create: { id: `scmu-demo-delivery-${index + 1}`, shipmentId: shipment.id, eventType: 'DELIVERED', location: 'Gudang Demo Merauke', city: 'Merauke', state: 'Papua Selatan', recordedAt: shipment.actualDelivery, notes: 'Penerimaan pengiriman demo SCMU.' } });
    }
  }
  for (const [index, status] of ['OPEN', 'OPEN', 'QUOTED', 'AWARDED'].entries()) {
    const route = data.routes[index]; const id = await legacyId(prisma.rFQ, `scmu-demo-rfq-${index + 1}`);
    const rfq = await prisma.rFQ.upsert({ where: { rfqNumber: `SCMU-RFQ-${String(index + 1).padStart(3, '0')}` }, update: {}, create: {
      id, rfqNumber: `SCMU-RFQ-${String(index + 1).padStart(3, '0')}`, title: `Pengiriman ${route.originCity} ke Merauke (Demo)`, shipperCompanyId: data.companies[0].id, createdById: admin.id,
      originCity: route.originCity, originState: route.originState, destCity: 'Merauke', destState: 'Papua Selatan', routeId: route.id, goodsTypeId: goods.id,
      vehicleType: 'TRUCK', weight: 10, quantity: 1, loadingDate: day(2), deliveryDate: day(2 + route.estimatedDays), expiresAt: day(1), basePrice: data.rfqPrice(index), status, currency: 'IDR', description: 'Permintaan penawaran pengiriman domestik ke Merauke - data simulasi.',
    } });
    if (index >= 2) {
      const quote = await prisma.quote.upsert({ where: { id: `scmu-demo-quote-${index + 1}` }, update: {}, create: { id: `scmu-demo-quote-${index + 1}`, rfqId: rfq.id, transporterId: data.companies[1].id, submittedById: operationsAdmin.id, amount: data.quotePrice(index), validUntil: day(1), currency: 'IDR', status: index === 3 ? 'ACCEPTED' : 'PENDING', notes: 'Penawaran vendor demo SCMU dalam rupiah.' } });
      if (index === 3 && rfq.status === 'AWARDED' && !rfq.awardedQuoteId) await prisma.rFQ.update({ where: { id: rfq.id }, data: { awardedQuoteId: quote.id } });
    }
  }
  for (const [index, status] of ['PENDING', 'SUBMITTED', 'PAID'].entries()) {
    const shipment = shipments[[2, 3, 5][index]];
    await prisma.invoice.upsert({ where: { shipmentId: shipment.id }, update: {}, create: { invoiceNumber: `SCMU-INV-${String(index + 1).padStart(3, '0')}`, shipmentId: shipment.id, companyId: data.companies[0].id, freightAmount: shipment.freightAmount, gstAmount: 0, totalAmount: shipment.freightAmount, status, currency: 'IDR', invoiceDate: day(-1), dueDate: day(14), paidDate: status === 'PAID' ? day(0) : null, createdAt: day(-1), notes: 'Invoice simulasi pengiriman domestik ke Merauke.' } });
  }
  await require('./seed-jpt')(prisma, admin);
  await require('./seed-own-fleet')(prisma, admin);
  await require('./seed-packing')(prisma, admin);
  await require('./seed-director')(prisma, admin);
  await require('./seed-sea')(prisma, admin);
  console.log('SCMU Merauke demo ready. Director: admin@scmu.local / Admin@1234; Admin: operasional@scmu.local / Ops@1234');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
