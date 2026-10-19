const assert = require('node:assert/strict');

const apiUrl = process.env.SCMU_API_URL || 'http://localhost:5000';
const frontendUrl = process.env.SCMU_FRONTEND_URL || 'http://localhost:5173';

async function request(path, { token, status = 200, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, status, `${path}: expected HTTP ${status}, received ${response.status}`);
  return response.json();
}

async function main() {
  const health = await request('/health');
  assert.equal(health.service, 'SCMU API');
  await request('/api/shipments', { status: 401 });
  await request('/api/auth/login', {
    status: 401, body: { email: 'admin@scmu.local', password: 'WrongPassword@123' },
  });

  const admin = await request('/api/auth/login', {
    body: { email: 'admin@scmu.local', password: 'Admin@1234' },
  });
  assert.equal(admin.user.role, 'SUPER_ADMIN');
  assert.ok(admin.token);
  assert.equal(admin.user.password, undefined);
  const options = { token: admin.token };
  const me = await request('/api/auth/me', options);
  assert.equal(me.email, 'admin@scmu.local');

  const dashboard = await request('/api/analytics/dashboard', options);
  assert.ok(dashboard.summary.totalShipments >= 6);
  assert.ok(dashboard.summary.totalVehicles >= 3);
  assert.ok(dashboard.summary.totalDrivers >= 3);
  assert.ok(dashboard.shipmentsByStatus.length > 0);
  const shipments = await request('/api/shipments?limit=100', options);
  const sample = shipments.data.find(item => item.shipmentNumber === 'SCMU-SHP-001');
  assert.ok(sample, 'SCMU sample shipment must be present');
  const detail = await request(`/api/shipments/${sample.id}`, options);
  assert.ok(detail.trackingEvents.length > 0);
  assert.ok(detail.vehicle && detail.driver && detail.shipper.name.includes('SCMU'));
  const companies = await request('/api/companies?limit=100', options);
  const seededCompanies = companies.data.filter(item => ['info@scmu.local', 'logistics@scmu.local', 'express@scmu.local'].includes(item.email));
  assert.equal(seededCompanies.length, 3);
  assert.ok(seededCompanies.every(item => item.email.endsWith('@scmu.local')));

  for (const path of [
    '/api/fleet', '/api/drivers', '/api/routes', '/api/goods', '/api/users',
    '/api/rfq', '/api/invoices', '/api/analytics/transporter-performance',
    '/api/analytics/route-analysis', '/api/reports/invoices', '/api/reports/shipments',
  ]) {
    await request(path, options);
  }

  const operator = await request('/api/auth/login', { body: { email: 'operasional@scmu.local', password: 'Ops@1234' } });
  assert.equal(operator.user.role, 'ADMIN');
  await request('/api/users', { token: operator.token, status: 403 });
  await request('/api/jobs', { token: operator.token });
  await request('/api/portal/jobs', { status: 404 });
  for (const path of ['/', '/login', '/shipments', '/scmu-logo.svg']) {
    const response = await fetch(`${frontendUrl}${path}`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `Frontend ${path} should be reachable`);
    const content = await response.text();
    if (path.endsWith('.svg')) {
      assert.ok(response.headers.get('content-type').includes('image/svg+xml'));
      assert.ok(content.includes('SCMU'));
    } else {
      assert.ok(content.includes('SCMU — Management System'));
      const assets = [...content.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)];
      assert.ok(assets.length > 0, 'Built assets must be referenced');
      for (const [, asset] of assets) {
        const assetResponse = await fetch(`${frontendUrl}${asset}`);
        assert.equal(assetResponse.status, 200, `Built asset ${asset} should load`);
      }
    }
  }

  console.log('PASS: SCMU health, Super Admin/Admin login, authorization, dashboard, all module APIs, tracking, built frontend and logo.');
  console.log(`Dashboard: ${JSON.stringify(dashboard.summary)}`);
}

main().catch(error => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
