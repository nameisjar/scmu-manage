import test from 'node:test';import assert from 'node:assert/strict';import {printableInternalPacking} from './internalPackingPrint.mjs';
const report=()=>({documentNumber:'PL-UJI',billNumber:'BL-UJI',vesselName:'KM Uji',voyageNumber:'04/26',sourceType:'RECEIVING_REPORT',sources:[{number:'BA-001',date:'2026-10-27'}],inspector:'Petugas',groups:[{containerNumber:'SCMU1234567',recipientName:'Toko uji',items:[{description:'Barang uji',expectedPackages:10,packages:9,damagedPackages:2,volumeCbm:null}]}],totals:{packages:9,volumeCbm:null},warnings:[]});
test('printed receiving-based PL retains expected, actual, damage, negative difference and source number',()=>{
 const html=printableInternalPacking(report());assert.match(html,/BA-001 \/ 2026-10-27/);assert.match(html,/Koli dokumen/);assert.match(html,/Koli aktual/);assert.match(html,/<td>10<\/td><td>9<\/td><td>2<\/td><td>-1<\/td>/);assert.match(html,/TOTAL KOLI: 9 \| CBM: —/);
});
test('untrusted source references and recipient/item strings are escaped in printed documents',()=>{
 const data=report();data.sources[0].number='<script>alert(1)</script>';data.groups[0].recipientName='<img src=x onerror=alert(1)>';data.groups[0].items[0].description='A&B <b>barang</b>';const html=printableInternalPacking(data);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/A&amp;B &lt;b&gt;barang&lt;\/b&gt;/);
});
test('field checklist uses blank actual/damage cells and repeats container identity in the print table header',()=>{
 const data=report();data.outputMode='CHECKLIST';data.groups[0].id='g';data.groups[0].items[0].id='i';data.groups[0].instructions='AMBIL SENDIRI';data.containers=[{number:'SCMU1234567',seal:'007'}];
 const html=printableInternalPacking(data);assert.match(html,/<thead>[\s\S]*Kontainer SCMU1234567 \/ Segel 007[\s\S]*<\/thead>/);assert.match(html,/AMBIL SENDIRI/);assert.match(html,/<td>________<\/td><td>________<\/td><td>________<\/td>/);assert.doesNotMatch(html,/☑/);assert.match(html,/☐ Diperiksa/);
 data.inspection={rows:[{key:'item:g:i',actualPackages:9,damagedPackages:2,difference:-1,checked:true,notes:'Kurang satu'}]};const checked=printableInternalPacking(data);assert.match(checked,/<td>9<\/td><td>2<\/td><td>-1<\/td>/);assert.match(checked,/Kurang satu/);
});
