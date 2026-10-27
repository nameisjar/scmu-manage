import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
process.env.NODE_ENV = 'production';
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server'); const { MemoryRouter } = require('react-router-dom'); const { createServer } = require('vite');
const store = new Map(); globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value), removeItem: key => store.delete(key) }; globalThis.window = { localStorage };
const server = await createServer({ root:fileURLToPath(new URL('../frontend',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom' });
try {
 const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx'); const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx');
 const render = (node,language='en',role='ADMIN') => { store.set('scmu_user',JSON.stringify({id:'test-user',name:'Test',role})); return renderToStaticMarkup(React.createElement(LanguageProvider,{initialLanguage:language},React.createElement(MemoryRouter,null,React.createElement(AuthProvider,null,node)))); };
 const loaded = await server.ssrLoadModule('/src/pages/BL/BLRegister.jsx').catch(() => ({}));
 assert.equal(typeof loaded.default,'function','BL register page must exist');
 for(const [language,texts] of [['en',['B/L register','New B/L','Search B/L','Month','Vessel','Port','Operational status','Refresh']],['id',['Register B/L','B/L baru','Cari B/L','Bulan','Kapal','Pelabuhan','Status operasional','Muat ulang']]]) {
  const html=render(React.createElement(loaded.default),language); for(const text of texts) assert.ok(html.includes(text),`Register ${language}: missing ${text}`);
  assert.ok(!html.includes('Recent Shipments')); assert.ok(html.includes('href="/bl-register/new"'));
 }
 const detail = await server.ssrLoadModule('/src/pages/BL/BLDetail.jsx').catch(() => ({}));
 assert.equal(typeof detail.RegisterForm,'function','Register form must exist');
 for(const [language,copy] of [['en',['B/L number','Customer name','Billing party','Book date out','UNCONFIRMED','Add container','Save B/L']],['id',['Nomor B/L','Nama pelanggan','Pihak tagihan','Tanggal keluar','Tambah kontainer','Simpan B/L']]]) {
  const html=render(React.createElement(detail.RegisterForm),language); for(const text of copy) assert.ok(html.includes(text),`Form ${language}: missing ${text}`);
  assert.ok(!html.includes('customerId')); assert.ok(!html.includes('quotationId'));
 }
 const revisionForm=render(React.createElement(detail.RegisterForm,{initial:{id:'reviewed-bill',billNumber:'BL-REVIEWED',version:2,approvedSnapshot:{},register:{},containers:[]}}));assert.ok(revisionForm.includes('Revision note'),'Reviewed BL identity edits must allow the required revision note');
 const view = await server.ssrLoadModule('/src/pages/BL/BLWorkspace.jsx').catch(() => ({}));
 assert.equal(typeof view.default,'function','BL detail workspace must exist');
 const bill={id:'bl-test',jobId:'job-test',billNumber:'BL-TEST',version:3,register:{},containers:[],financials:{receivable:'0'}};
 const html=render(React.createElement(view.default,{bill,onReload:()=>{}}));
 for(const text of ['Identity','Containers','Documents','Costs','History','BL-TEST']) assert.ok(html.includes(text),`Detail missing ${text}`);
 assert.equal(typeof view.DocumentLinks,'function');
 const docs=render(React.createElement(view.DocumentLinks,{bill})); assert.ok(docs.includes('/jobs/job-test?tab=documents'));assert.ok(docs.includes('/jobs/job-test?tab=sea'));assert.ok(docs.includes('do not release cargo'));
 const gates=render(React.createElement(view.DocumentLinks,{bill:{...bill,documentSummary:{internalStatus:'SEA_UNCHECKED',releaseStatus:'SEA_RELEASE_PENDING',receiptStatus:'SEA_NOT_RECEIVED'}}}));for(const status of ['SEA_UNCHECKED','SEA_RELEASE_PENDING','SEA_NOT_RECEIVED'])assert.ok(gates.includes(status),'Document gate state must be visible '+status);
 const estimator = await server.ssrLoadModule('/src/pages/BL/TariffEstimator.jsx').catch(() => ({})); assert.equal(typeof estimator.default,'function','Estimator exists');
 const estimateHtml=render(React.createElement(estimator.default,{bill})); for(const text of ['Tariff estimator','Estimate','Propose revenue','PPh 23 2%','Select tariffs explicitly']) assert.ok(estimateHtml.includes(text));
 const tariffs = await server.ssrLoadModule('/src/pages/BL/JPTTariffs.jsx').catch(() => ({}));assert.equal(typeof tariffs.default,'function','Tariff master exists');
 const admin=render(React.createElement(tariffs.default)); assert.ok(admin.includes('Read-only'));assert.ok(!admin.includes('>New tariff<'));
 const superAdmin=render(React.createElement(tariffs.default),'en','SUPER_ADMIN');assert.ok(superAdmin.includes('New tariff'));
 assert.equal(typeof tariffs.TariffForm,'function');const form=render(React.createElement(tariffs.TariffForm,{onSaved:()=>{},onCancel:()=>{}})); for(const text of ['Code','Effective from','Effective to','VAT rate','Confirmation required','Save tariff'])assert.ok(form.includes(text));
 console.log('PASS: bilingual register/create/detail/estimator, gated tariff master and effective-date form.');
} finally { await server.close(); delete globalThis.window; delete globalThis.localStorage; }
