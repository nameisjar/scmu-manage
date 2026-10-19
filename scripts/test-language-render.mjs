import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
process.env.NODE_ENV = 'production';
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const { createServer } = require('vite');
const frontendRoot = fileURLToPath(new URL('../frontend', import.meta.url));
const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage };

const server = await createServer({ root: frontendRoot, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx');
  const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx');
  const { StatusBadge } = await server.ssrLoadModule('/src/components/common/index.jsx');
  const checks = [
    ['/src/pages/JPT/Quotations.jsx', ['Penawaran komersial', 'Penawaran baru'], ['Commercial quotations', 'New quotation']],
    ['/src/pages/JPT/Jobs.jsx', ['Job order', 'Buat job order'], ['Job orders', 'Create job order']],
    ['/src/pages/JPT/Finance.jsx', ['Keuangan job', 'Ekspor CSV'], ['Job finance', 'Export CSV']],
    ['/src/pages/Login.jsx', ['Masuk', 'Alamat email', 'Akun demo'], ['Sign in', 'Email address', 'Demo credentials']],
    ['/src/components/Layout/Sidebar.jsx', ['Dasbor', 'Pengiriman', 'Armada', 'Keluar'], ['Dashboard', 'Shipments', 'Fleet', 'Logout']],
    ['/src/pages/Settings/SettingsPage.jsx', ['Bahasa tampilan', 'Kata Sandi Baru', 'Pengaturan'], ['Display language', 'New Password', 'Settings']],
    ['/src/pages/RFQ/CreateRFQ.jsx', ['Buat RFQ', 'Tanggal Muat'], ['Create RFQ', 'Loading Date']],
    ['/src/pages/Shipments/CreateShipment.jsx', ['Buat Pengiriman', 'Jenis Barang'], ['Create Shipment', 'Goods Type']],
    ['/src/pages/Fleet/FleetList.jsx', ['Manajemen Armada', 'Tambah Kendaraan'], ['Fleet Management', 'Add Vehicle']],
    ['/src/pages/Users/UserManagement.jsx', ['Manajemen Pengguna', 'Tambah Pengguna'], ['User Management', 'Add User']],
    ['/src/pages/Reports/ReportsPage.jsx', ['Laporan Invoice', 'Laporan Pengiriman', 'Buat Laporan'], ['Invoice Report', 'Shipment Report', 'Generate Report']],
  ];
  store.set('scmu_user', JSON.stringify({ name: 'SCMU Demo', role: 'SUPER_ADMIN', email: 'admin@scmu.local' }));
  const render = (node, language) => renderToStaticMarkup(React.createElement(LanguageProvider, { initialLanguage: language },
    React.createElement(MemoryRouter, null, React.createElement(AuthProvider, null, node))));
  for (const [module, idTexts, enTexts] of checks) {
    const { default: Component } = await server.ssrLoadModule(module);
    for (const [language, texts] of [['id', idTexts], ['en', enTexts]]) {
      const html = render(React.createElement(Component), language);
      for (const text of texts) assert.ok(html.includes(text), `${module} [${language}] is missing ${text}`);
      if (module.includes('Login') || module.includes('Sidebar') || module.includes('Settings')) {
        const options = html.match(/<option\b[^>]*>/g) || [];
        assert.ok(options.some(option => option.includes(`value="${language}"`) && option.includes('selected=""')), `Selector should show ${language}`);
      }
    }
  }
  const { default: Sidebar } = await server.ssrLoadModule('/src/components/Layout/Sidebar.jsx');
  const { default: UserManagement } = await server.ssrLoadModule('/src/pages/Users/UserManagement.jsx');
  store.set('scmu_user', JSON.stringify({ name: 'Admin', role: 'ADMIN' }));
  const adminNavigation = render(React.createElement(Sidebar), 'id');
  assert.ok(!adminNavigation.includes('href="/users"'));
  assert.ok(!adminNavigation.includes('href="/customers"') && !adminNavigation.includes('href="/portal"'));
  assert.ok(render(React.createElement(UserManagement), 'id').includes('hanya tersedia bagi Super Admin'));
  store.set('scmu_user', JSON.stringify({ name: 'Legacy', role: 'CUSTOMER' })); store.set('scmu_token', 'old-session');
  render(React.createElement(Sidebar), 'id');
  assert.equal(store.get('scmu_user'), undefined); assert.equal(store.get('scmu_token'), undefined);
  store.set('scmu_user', JSON.stringify({ name: 'SCMU', role: 'SUPER_ADMIN' }));
  const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
  store.set('scmu_language', 'en');
  assert.ok(render(React.createElement(Login)).includes('Demo credentials'), 'Stored English preference should survive a new render');
  store.set('scmu_language', 'id');
  assert.ok(render(React.createElement(Login)).includes('Akun demo'), 'Stored Indonesian preference should survive a new render');
  assert.ok(render(React.createElement(StatusBadge, { status: 'IN_TRANSIT' }), 'id').includes('Dalam perjalanan'));
  assert.ok(render(React.createElement(StatusBadge, { status: 'IN_TRANSIT' }), 'en').includes('In transit'));
  console.log('PASS: Indonesian/English rendering across login, navigation, settings, forms, fleet, users, reports, selectors, status labels, and stored language preference.');
} finally {
  await server.close();
  delete globalThis.localStorage;
  delete globalThis.window;
}
