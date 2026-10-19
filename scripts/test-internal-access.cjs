const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const bcrypt = require('../backend/node_modules/bcryptjs');
const jwt = require('../backend/node_modules/jsonwebtoken');
const { io } = require('../frontend/node_modules/socket.io-client');
const { INTERNAL_COMPANY_ID } = require('../backend/src/services/access');
const databaseUrl = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
const origin = process.env.SCMU_API_URL || 'http://127.0.0.1:5000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname) && new URL(databaseUrl).pathname === '/scmu_demo');
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); const ids = []; const sockets = [];
async function request(route, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await fetch(`${origin}/api${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); return data;
}
async function preservation() {
  let before; try { before = JSON.parse(await fs.readFile(path.join(__dirname, '../.demo/internal-preserved-before.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const [model, expected] of Object.entries(before)) {
    // Later feature demos may add transactions and columns. Every original record
    // must still exist with exactly its original business fields and values.
    const rows = await prisma[model].findMany({ where: { id: { in: expected.map(row => row.id) } }, orderBy: { id: 'asc' } });
    const keys = new Set(Object.keys(expected[0] || {}));
    const actual = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => keys.has(key))));
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, `Migration must preserve ${model} transactions and amounts`);
  }
}
async function connect(token, accepted) {
  const socket = io(origin, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 }); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', () => accepted ? resolve() : reject(Error('Unexpected socket access'))); socket.once('connect_error', error => accepted ? reject(error) : resolve()); }); return socket;
}
async function main() {
  await preservation();
  assert.equal(await prisma.user.count({ where: { role: 'CUSTOMER' } }), 0, 'Customer accounts must be deleted');
  assert.equal(await prisma.company.count({ where: { isInternal: false, type: { in: ['SHIPPER', 'BOTH'] } } }), 0, 'Customer masters must be deleted');
  assert.equal(await prisma.user.count({ where: { isActive: true, role: { notIn: ['SUPER_ADMIN','ADMIN'] } } }), 0);
  for (const [model, key] of [['jobOrder','customerId'], ['salesQuotation','customerId'], ['shipment','shipperCompanyId'], ['rFQ','shipperCompanyId'], ['invoice','companyId']]) assert.equal(await prisma[model].count({ where: { [key]: { not: INTERNAL_COMPANY_ID } } }), 0);
  const sa = await request('/auth/login', null, { email: 'admin@scmu.local', password: 'Admin@1234' }); assert.equal(sa.user.role, 'SUPER_ADMIN');
  const admin = await request('/auth/login', null, { email: 'operasional@scmu.local', password: 'Ops@1234' }); assert.equal(admin.user.role, 'ADMIN');
  for (const [email,password] of [['customer@scmu.local','Customer@1234'],['transporter@scmu.local','Trans@1234'],['operator@scmu.local','Operator@1234'],['viewer@scmu.local','Viewer@1234']]) await request('/auth/login', null, { email,password }, 'POST',401);
  await request('/portal/jobs', null, null, 'GET',404); await request('/portal/requests', sa.token, {}, 'POST',404);
  for (const route of ['/jobs','/sales-quotations','/invoices','/rfq','/companies']) await request(route,admin.token);
  await request('/users',admin.token,null,'GET',403); await request('/users',admin.token,{name:'Denied'},'POST',403);
  await request(`/users/${sa.user.id}`,admin.token,{role:'ADMIN'},'PUT',403);
  await request(`/users/${sa.user.id}`,sa.token,{isActive:false},'PUT',409);
  await request(`/users/${sa.user.id}`,sa.token,{role:'ADMIN'},'PUT',409);
  await request(`/users/${sa.user.id}`,sa.token,null,'DELETE',409);
  await request(`/companies/${INTERNAL_COMPANY_ID}`,admin.token,{name:'Denied'},'PUT',403);
  await request(`/companies/${INTERNAL_COMPANY_ID}`,sa.token,null,'DELETE',409);
  for (const type of ['SHIPPER','BOTH']) await request('/companies',admin.token,{name:'Denied customer',type},'POST',422);
  for (const role of ['CUSTOMER','TRANSPORTER','MANAGER','OPERATOR','VIEWER']) await request('/users',sa.token,{name:'Denied role',email:`denied-${randomUUID()}@scmu.local`,password:'Test@1234',role},'POST',422);
  const email = `test-internal-${randomUUID()}@scmu.local`; const password = `Test@${randomUUID()}`;
  const user = await request('/users',sa.token,{name:'Internal access test',email,password,role:'ADMIN'},'POST',201); ids.push(user.id);
  const login = await request('/auth/login',null,{email,password});
  const secret = await fs.readFile(path.join(__dirname,'../.demo/jwt-secret'),'utf8');
  const forgedRole = jwt.sign({userId:user.id,role:'SUPER_ADMIN'},secret,{expiresIn:'1m'});
  await request('/users',forgedRole,null,'GET',403);
  const socket = await connect(login.token,true);
  const disconnected = new Promise((resolve,reject) => { const timer = setTimeout(()=>reject(Error('Deactivated socket remained connected')),5000); socket.once('disconnect',()=>{clearTimeout(timer);resolve();}); });
  await request(`/users/${user.id}`,sa.token,{isActive:false},'PUT'); await disconnected;
  await request('/jobs',login.token,null,'GET',401); await connect(login.token,false);
  const legacy = await prisma.user.create({data:{name:'Inactive legacy test',email:`legacy-${randomUUID()}@scmu.local`,password:await bcrypt.hash(password,10),role:'OPERATOR',isActive:false}});ids.push(legacy.id);
  const oldToken = jwt.sign({userId:legacy.id,role:'SUPER_ADMIN'},secret,{expiresIn:'1m'});
  await request('/jobs',oldToken,null,'GET',401); await connect(oldToken,false);
  await assert.rejects(prisma.user.update({where:{id:legacy.id},data:{isActive:true}}));
  const users = await request('/users',sa.token); assert.ok(users.data.every(row=>['SUPER_ADMIN','ADMIN'].includes(row.role)));
  console.log('PASS: customer master/accounts removed; business history preserved under SCMU; only two login roles; Super Admin-only user management; revoked/forged/legacy tokens and sockets denied; database blocks legacy activation.');
}
main().catch(error=>{console.error(`FAIL: ${error.message}`);process.exitCode=1;}).finally(async()=>{for(const socket of sockets)socket.disconnect();await prisma.activityLog.deleteMany({where:{OR:[{userId:{in:ids}},{entity:'User',entityId:{in:ids}}]}});await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();});
