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
 assert.ok(!html.includes('data-bl-import'),'Manual creation must not offer a separate competing upload flow');
 const required=[...html.matchAll(/<input[^>]*required=""[^>]*>/g)].map(match=>match[0]);assert.equal(required.length,0,'Draft shipment must not require a B/L number');
 assert.ok(!html.includes('Nomor register'),'Internal register identity must not be visible');
 assert.ok(html.includes('21 berasal dari daftar tarif'),'Unconfirmed 21 header caveat');
 console.log('PASS unified form: all fields, optional metadata, independent counts, neutral amount.');
 const {default:List}=await server.ssrLoadModule('/src/pages/BL/BLRegister.jsx');const list=render(React.createElement(List),'/bl-register');
 for(const text of ['Pengiriman','Filter lainnya','Kelengkapan dokumen','Urutan','Ekspor','B/L &amp; Mitra','Kapal &amp; Voyage','Kontainer','Keluar / Masuk','Dokumen'])assert.ok(list.includes(text),'Summary list missing '+text);
 assert.ok(!list.includes('Nomor register'));assert.ok(!list.includes('Piutang'));assert.ok(list.includes('data-register-view="summary"'));assert.ok(!list.includes('data-column="registerAmount"'),'Financial detail should not crowd summary');
 assert.ok(!list.includes('data-table-toolbar'));assert.ok(!list.includes('data-column="__selection"'));assert.ok(!list.includes('>Rinci</button>'));assert.ok(!list.includes('>Kolom</button>'));
 assert.equal((list.match(/>Tambah pengiriman<\/button>/g)||[]).length,1,'Shipments has one create entry');assert.ok(!list.includes('Unggah dokumen sekaligus'));
 const trash=render(React.createElement(List,{trash:true}),'/bl-register/trash');for(const label of ['Sampah pengiriman','Tanggal dihapus','Dihapus oleh','Alasan penghapusan','Kembali ke Pengiriman'])assert(trash.includes(label),'Trash missing '+label);assert(!trash.includes('>Tambah pengiriman</button>'));assert(!trash.includes('>Rekap dari B/L</button>'));
 const {default:BLSummary}=await server.ssrLoadModule('/src/pages/BL/BLSummary.jsx');
 const summary=render(React.createElement(BLSummary,{bill:{id:'test',billNumber:'BL-DETAIL',grossWeightKg:0,notes:'NOTE-ORIGINAL',createdAt:'2026-04-01',updatedAt:'2026-04-02',register:{reference1:'REF-INTERNAL-TEST',reference2:'INV-TEST',additionalDate1:'2026-04-03',additionalDate2:'2026-04-04',quantity20:0,cargoDescription:'CARGO-TEST',additionalNotes:'NOTE-ADDITIONAL',documentPolicy:'BL_ONLY',includeInPackingHeader:false},registerAmount:'0.00'},onNavigate:()=>{}}));
 for(const text of ['REF-INTERNAL-TEST','INV-TEST','Tanggal invoice','Berat kotor (kg)','Informasi pencatatan','Terakhir diperbarui','NOTE-ORIGINAL','CARGO-TEST','NOTE-ADDITIONAL','Aturan dokumen mitra'])assert(summary.includes(text),'Detail missing '+text);assert(summary.includes('<dd>0</dd>'),'Known zero weight shown as missing');

 const {RegisterOverview}=await server.ssrLoadModule('/src/pages/Dashboard.jsx');assert.equal(typeof RegisterOverview,'function');
 const dash=render(React.createElement(RegisterOverview,{summary:{totalRegisters:12,periodRegisters:3,missingBL:2,missingPackingList:4,incompleteRegisters:5,byVessel:[{vesselName:'MV TEST',count:8}],byVoyage:[{voyageNumber:'V9',count:4}],recentRegisters:[{id:'r1',registerNumber:'REG-001',billNumber:'BL-001'}]}}),'/');
 for(const text of ['Total B/L','B/L terbaru','File B/L belum tersedia','PL perlu tindakan','MV TEST','V9','BL-001'])assert.ok(dash.includes(text),'Dashboard missing '+text);assert.ok(!dash.includes('Piutang'));
 console.log('PASS compact filter toolbar, grouped wide list and operational dashboard.');
 const {default:Workspace}=await server.ssrLoadModule('/src/pages/BL/BLWorkspace.jsx');const detailBill={id:'detail',billNumber:'BL-UI',register:{dateMeaning:'UNCONFIRMED'},containers:[{number:'SPNU2942265',seal:'001',size:'40'}],files:[],registerData:{},documentAvailability:{}};
 const detail=render(React.createElement(Workspace,{bill:detailBill}),'/bl-register/detail?tab=containers');assert.equal((detail.match(/role="tab"/g)||[]).length,5);assert(!detail.includes('Kontainer &amp; Bongkar'));for(const label of ['Packing List &amp; Rekap','Bonrate Sopir','Kontainer dalam B/L','SPNU2942265'])assert(detail.includes(label),'Document-centred detail missing '+label);
 const bons=render(React.createElement(Workspace,{bill:detailBill}),'/bl-register/detail?tab=driver-bons');assert(bons.includes('Tambah bonrate'));assert(bons.includes('Belum ada bonrate sopir.'));assert(!bons.includes('data-column="__selection"'));console.log('PASS document-centred tabs, legacy container URL, embedded B/L identity and driver vouchers');
} finally {await server.close();delete globalThis.window;delete globalThis.localStorage;}
