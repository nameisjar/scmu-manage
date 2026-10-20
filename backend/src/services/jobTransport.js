const { transportFields } = require('./transport');
const { mutableJob, choice, date, fail, text, number, syncJob, audit } = require('./jpt');
async function prepareLeg(tx, jobId, body) {
  const job = await mutableJob(tx, jobId);
  const mode = choice(body.mode || 'ROAD', ['ROAD', 'SEA', 'AIR', 'RAIL']);
  const loadingDate = date(body.loadingDate); const expectedDelivery = date(body.expectedDelivery, true);
  fail(!expectedDelivery || expectedDelivery >= loadingDate, 'Delivery must be after pickup');
  const data = { ...(await transportFields(tx, { ...body, mode })), originCity: text(body.originCity, 'Origin', 100), originState: text(body.originState || '-', 'Origin province', 100), destCity: text(body.destCity, 'Destination', 100), destState: text(body.destState || '-', 'Destination province', 100), loadingDate, expectedDelivery,
    bookingNumber: text(body.bookingNumber, 'Booking number', 100, true), vesselFlight: text(body.vesselFlight, 'Vessel or flight', 100, true), containerNumber: text(body.containerNumber, 'Container number', 50, true), sealNumber: text(body.sealNumber, 'Seal number', 50, true), freeUntil: date(body.freeUntil, true), notes: text(body.notes, 'Notes', 2000, true) };
  return { job, data };
}
async function createLeg(tx, user, prepared) {
  const { job, data } = prepared;
  const shipment = await tx.shipment.create({ data: { ...data, jobId: job.id, shipperCompanyId: job.customerId, createdById: user.id, currency: job.currency, shipmentNumber: number('SHP'), sequence: await tx.shipment.count({ where: { jobId: job.id } }) + 1, weight: Number(job.weightKg) / 1000, quantity: job.packages } });
  const type = data.mode === 'SEA' ? 'BILL_OF_LADING' : data.mode === 'AIR' ? 'AIR_WAYBILL' : 'SURAT_JALAN';
  if (data.mode === 'SEA') await require('./seaBills').createBill(tx, user, job.id, { shipmentId: shipment.id }, true);
  else await tx.jobDocument.create({ data: { jobId: job.id, shipmentId: shipment.id, type, title: `${type} - ${shipment.shipmentNumber}`, required: true, customerVisible: false } });
  await syncJob(tx, job.id); await audit(tx, user, 'TRANSPORT_LEG_CREATED', 'JobOrder', job.id, { shipmentId: shipment.id, mode: data.mode }); return shipment;
}
module.exports = { prepareLeg, createLeg };
