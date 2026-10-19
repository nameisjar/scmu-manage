const { demoId, jptId, companies, routes, vehicles, drivers, goods, shipmentFreight, rfqPrice, quotePrice } = require('./demo-indonesia');

// Upgrade only the known seed identities once. Later seed runs preserve user edits.
module.exports = async function upgradeDemoIndonesia(prisma, admin) {
  const marker = demoId('region-merauke-20261019-v1');
  if (await prisma.activityLog.findUnique({ where: { id: marker } })) return;
  await prisma.$transaction(async tx => {
    for (const company of companies) await tx.company.updateMany({ where: { id: company.id }, data: { ...company, gstin: null } });
    for (const { legacyId, mode, ...route } of routes) {
      const old = await tx.route.findUnique({ where: { id: legacyId } });
      if (old) await tx.route.update({ where: { id: old.id }, data: { ...route, distanceKm: null } });
    }
    for (const { legacyRegistration, companyIndex, ...vehicle } of vehicles) await tx.vehicle.updateMany({ where: { registrationNo: legacyRegistration }, data: { ...vehicle, companyId: companies[companyIndex].id } });
    for (const { legacyPhone, companyIndex, ...driver } of drivers) await tx.driver.updateMany({ where: { phone: legacyPhone }, data: { ...driver, companyId: companies[companyIndex].id } });
    for (const [legacyName, name] of goods) if (!await tx.goodsType.findUnique({ where: { name } })) await tx.goodsType.updateMany({ where: { name: legacyName }, data: { name } });
    for (let i = 0; i < 6; i++) {
      const route = routes[i % routes.length];
      await tx.shipment.updateMany({ where: { shipmentNumber: `SCMU-SHP-${String(i + 1).padStart(3, '0')}` }, data: {
        originCity: route.originCity, originState: route.originState, destCity: route.destCity, destState: route.destState, mode: route.mode,
        currency: 'IDR', freightAmount: shipmentFreight(i), notes: 'Pengiriman contoh SCMU ke Merauke. Harga dan waktu merupakan simulasi demo.',
      } });
      await tx.trackingEvent.updateMany({ where: { id: `scmu-demo-departure-${i + 1}` }, data: { location: `Gudang Demo ${route.originCity}`, city: route.originCity, state: route.originState, notes: 'Keberangkatan pengiriman demo SCMU.' } });
      await tx.trackingEvent.updateMany({ where: { id: `scmu-demo-delivery-${i + 1}` }, data: { location: 'Gudang Demo Merauke', city: 'Merauke', state: 'Papua Selatan', notes: 'Penerimaan pengiriman demo SCMU.' } });
    }
    for (let i = 0; i < 4; i++) {
      const route = routes[i];
      await tx.rFQ.updateMany({ where: { rfqNumber: `SCMU-RFQ-${String(i + 1).padStart(3, '0')}` }, data: { title: `Pengiriman ${route.originCity} ke Merauke (Demo)`, originCity: route.originCity, originState: route.originState, destCity: 'Merauke', destState: 'Papua Selatan', currency: 'IDR', basePrice: rfqPrice(i), description: 'Permintaan penawaran pengiriman domestik ke Merauke - data simulasi.' } });
      await tx.quote.updateMany({ where: { id: `scmu-demo-quote-${i + 1}` }, data: { amount: quotePrice(i), currency: 'IDR', notes: 'Penawaran vendor demo SCMU dalam rupiah.' } });
    }
    for (const [i, shipmentIndex] of [2, 3, 5].entries()) await tx.invoice.updateMany({ where: { invoiceNumber: `SCMU-INV-${String(i + 1).padStart(3, '0')}` }, data: { freightAmount: shipmentFreight(shipmentIndex), gstAmount: 0, totalAmount: shipmentFreight(shipmentIndex), currency: 'IDR', notes: 'Invoice simulasi pengiriman domestik ke Merauke.' } });
    const oldJptRoute = await tx.route.findUnique({ where: { id: jptId('route-surabaya-jayapura') } });
    if (oldJptRoute) await tx.route.update({ where: { id: oldJptRoute.id }, data: { id: jptId('route-surabaya-merauke'), name: 'Surabaya - Merauke (Demo)', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 14 } });
    await tx.company.updateMany({ where: { id: jptId('sea-vendor') }, data: { city: 'Merauke', state: 'Papua Selatan' } });
    await tx.salesQuotation.updateMany({ where: { quotationNumber: { in: ['SCMU-SQ-DEMO-001', 'SCMU-SQ-DEMO-002'] } }, data: { title: 'Distribusi peralatan Surabaya - Merauke (Demo)', destCity: 'Merauke' } });
    await tx.jobOrder.updateMany({ where: { jobNumber: 'SCMU-JOB-DEMO-001' }, data: { title: 'Distribusi peralatan Surabaya - Merauke (Demo)', destCity: 'Merauke', recipientName: 'Penerima Demo Merauke', deliveryAddress: 'Alamat contoh penerima demo, Merauke, Papua Selatan' } });
    await tx.shipment.updateMany({ where: { shipmentNumber: 'SCMU-JPT-SHP-2' }, data: { destCity: 'Pelabuhan Merauke', destState: 'Papua Selatan' } });
    await tx.shipment.updateMany({ where: { shipmentNumber: 'SCMU-JPT-SHP-3' }, data: { originCity: 'Pelabuhan Merauke', originState: 'Papua Selatan', destCity: 'Merauke', destState: 'Papua Selatan' } });
    await tx.activityLog.create({ data: { id: marker, userId: admin.id, action: 'DEMO_REGION_UPDATED', entity: 'DemoDataset', entityId: 'merauke-v1', metadata: { region: 'Merauke, Indonesia', currency: 'IDR', source: 'Known demo identifiers only' } } });
  }, { timeout: 30000 });
  console.log('Known demo records upgraded to Merauke, Indonesia and IDR.');
};
