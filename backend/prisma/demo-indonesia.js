// Fictional presentation data; not carrier schedules, market rates or real identities.
const { v5: uuidv5 } = require('uuid');
const demoId = name => uuidv5(`scmu-demo:${name}`, uuidv5.DNS);
const jptId = name => uuidv5(`scmu-jpt:${name}`, uuidv5.DNS);
const companies = [
  { id: demoId('seed-company-001'), name: 'SCMU', type: 'SHIPPER', isInternal: true, city: 'Merauke', state: 'Papua Selatan', address: 'Alamat internal SCMU, Merauke', phone: '081200000101', email: 'info@scmu.local', npwp: 'NPWP-DEMO-001' },
  { id: demoId('seed-trans-001'), name: 'SCMU Logistik Nusantara (Demo)', type: 'TRANSPORTER', city: 'Surabaya', state: 'Jawa Timur', address: 'Alamat contoh mitra SCMU, Surabaya', phone: '081200000102', email: 'logistics@scmu.local', npwp: 'NPWP-DEMO-002' },
  { id: demoId('seed-trans-002'), name: 'SCMU Ekspres Papua (Demo)', type: 'TRANSPORTER', city: 'Merauke', state: 'Papua Selatan', address: 'Alamat contoh mitra SCMU, Merauke', phone: '081200000103', email: 'express@scmu.local', npwp: 'NPWP-DEMO-003' },
];
const routes = [
  { id: demoId('route-indonesia-1'), legacyId: 'route-bangalore-mumbai', name: 'Surabaya → Merauke (Demo)', originCity: 'Surabaya', originState: 'Jawa Timur', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 14, mode: 'SEA' },
  { id: demoId('route-indonesia-2'), legacyId: 'route-delhi-kolkata', name: 'Makassar → Merauke (Demo)', originCity: 'Makassar', originState: 'Sulawesi Selatan', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 10, mode: 'SEA' },
  { id: demoId('route-indonesia-3'), legacyId: 'route-mumbai-chennai', name: 'Jakarta → Merauke (Demo)', originCity: 'Jakarta', originState: 'DKI Jakarta', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 18, mode: 'SEA' },
  { id: demoId('route-indonesia-4'), legacyId: 'route-hyderabad-pune', name: 'Jayapura → Merauke (Demo)', originCity: 'Jayapura', originState: 'Papua', destCity: 'Merauke', destState: 'Papua Selatan', estimatedDays: 2, mode: 'AIR' },
];
const vehicles = [
  { registrationNo: 'L 9001 SM', legacyRegistration: 'KA01AB1234', type: 'TRUCK', capacity: 10, make: 'Hino', model: 'Ranger (Demo)', companyIndex: 1 },
  { registrationNo: 'DD 9002 SM', legacyRegistration: 'MH02CD5678', type: 'TRAILER', capacity: 25, make: 'Isuzu', model: 'Giga (Demo)', companyIndex: 1 },
  { registrationNo: 'B 9003 SM', legacyRegistration: 'DL03EF9012', type: 'CONTAINER', capacity: 20, make: 'Mitsubishi Fuso', model: 'Fighter (Demo)', companyIndex: 2 },
];
const drivers = [
  { name: 'Budi Santoso (Demo)', phone: '081200000201', licenseNo: 'SIM-DEMO-001', city: 'Surabaya', state: 'Jawa Timur', legacyPhone: '9500011111', companyIndex: 1 },
  { name: 'Andi Pratama (Demo)', phone: '081200000202', licenseNo: 'SIM-DEMO-002', city: 'Makassar', state: 'Sulawesi Selatan', legacyPhone: '9500022222', companyIndex: 1 },
  { name: 'Yohanes Gebze (Demo)', phone: '081200000203', licenseNo: 'SIM-DEMO-003', city: 'Merauke', state: 'Papua Selatan', legacyPhone: '9500033333', companyIndex: 2 },
];
const goods = [['General Cargo', 'Kargo Umum'], ['FMCG', 'Barang Konsumsi'], ['Pharmaceuticals', 'Farmasi'], ['Electronics', 'Elektronik'], ['Automobiles', 'Kendaraan'], ['Chemicals', 'Bahan Kimia'], ['Steel', 'Besi dan Baja'], ['Food & Beverages', 'Makanan dan Minuman']];
const shipmentFreight = index => 8000000 + index * 1500000;
const rfqPrice = index => 10000000 + index * 2000000;
const quotePrice = index => 9500000 + index * 2000000;
module.exports = { demoId, jptId, companies, routes, vehicles, drivers, goods, shipmentFreight, rfqPrice, quotePrice };
