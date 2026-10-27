import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));process.env.NODE_ENV='production';
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {MemoryRouter}=require('react-router-dom');const {createServer}=require('vite');
const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};globalThis.window={localStorage};
const server=await createServer({root:fileURLToPath(new URL('../frontend',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
 const {LanguageProvider}=await server.ssrLoadModule('/src/i18n/LanguageContext.jsx');const {AuthProvider}=await server.ssrLoadModule('/src/context/AuthContext.jsx');
 const render=(node,url='/bl-register/new',role='ADMIN')=>{store.set('scmu_user',JSON.stringify({id:'test',name:'Test',role}));return renderToStaticMarkup(React.createElement(LanguageProvider,{initialLanguage:'id'},React.createElement(MemoryRouter,{initialEntries:[url]},React.createElement(AuthProvider,null,node))));};
 const {RegisterForm}=await server.ssrLoadModule('/src/pages/BL/BLDetail.jsx');
 const html=render(React.createElement(RegisterForm));
 for(const label of ['Vendor/JPT','Pihak penanggung jawab','Nomor internal','Nomor invoice','Tanggal invoice','Jatuh tempo','Catatan tambahan','Jumlah 20','Jumlah 21','Jumlah 40','Jumlah tagihan','Status tagihan','Aturan dokumen mitra','Simpan pengiriman'])assert.ok(html.includes(label),'Unified form missing '+label);
 assert.equal((html.match(/<form/g)||[]).length,1,'All manual fields share a single form');
 const required=[...html.matchAll(/<input[^>]*required=""[^>]*>/g)].map(match=>match[0]);assert.equal(required.length,1);assert.ok(required[0].includes('Nomor B/L'));
 assert.ok(!html.includes('Nomor register'),'Internal register identity must not be visible');
 assert.ok(html.includes('21 berasal dari daftar tarif'),'Unconfirmed 21 header caveat');
 console.log('PASS unified form: all fields, optional metadata, independent counts, neutral amount.');
 const {default:List}=await server.ssrLoadModule('/src/pages/BL/BLRegister.jsx');const list=render(React.createElement(List),'/bl-register');
 for(const text of ['Pengiriman','Filter lainnya','Kelengkapan dokumen','Urutan','Kolom','Ekspor','Identitas pengiriman','Tanggal dan jumlah','Tagihan','Nomor B/L','Vendor/JPT','Nomor invoice','Jumlah 20','Jumlah 21','Jumlah 40','Jumlah tagihan'])assert.ok(list.includes(text),'List missing '+text);
 assert.ok(!list.includes('Nomor register'));assert.ok(!list.includes('Piutang'));assert.ok(list.includes('sticky left-0'));assert.ok(!list.includes('sticky left-48'));assert.ok(!list.includes('truncate'));
 const {RegisterOverview}=await server.ssrLoadModule('/src/pages/Dashboard.jsx');assert.equal(typeof RegisterOverview,'function');
 const dash=render(React.createElement(RegisterOverview,{summary:{totalRegisters:12,periodRegisters:3,missingBL:2,missingPackingList:4,incompleteRegisters:5,byVessel:[{vesselName:'MV TEST',count:8}],byVoyage:[{voyageNumber:'V9',count:4}],recentRegisters:[{id:'r1',registerNumber:'REG-001',billNumber:'BL-001'}]}}),'/');
 for(const text of ['Total B/L','B/L terbaru','File B/L belum tersedia','PL perlu tindakan','MV TEST','V9','BL-001'])assert.ok(dash.includes(text),'Dashboard missing '+text);assert.ok(!dash.includes('Piutang'));
 console.log('PASS compact filter toolbar, grouped wide list and operational dashboard.');
} finally {await server.close();delete globalThis.window;delete globalThis.localStorage;}
