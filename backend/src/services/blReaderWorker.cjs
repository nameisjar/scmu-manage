// Isolated, bounded local document reader. No database credentials or external document APIs.
const fs=require('node:fs/promises');const path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const {createWorker}=require('tesseract.js');
const language=require('@tesseract.js-data/eng');
function imageBounds(buffer,mime){
 let width,height;
 if(mime==='image/png'){width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);}
 else {let p=2;while(p+8<buffer.length){if(buffer[p]!==255){p++;continue;}const marker=buffer[p+1];p+=2;if(marker===216||marker===217)continue;const length=buffer.readUInt16BE(p);if(length<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=buffer.readUInt16BE(p+3);width=buffer.readUInt16BE(p+5);break;}p+=length;}}
 if(!width||!height||width*height>20000000||width>12000||height>12000)throw Error('Ukuran gambar terlalu besar atau tidak valid. Gunakan foto maksimal 20 megapiksel.');
}
function rowsFromItems(items){
 const rows=[];for(const item of items){if(!item.str?.trim())continue;let row=rows.find(r=>Math.abs(r.y-item.transform[5])<2.3);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push({x:item.transform[4],width:item.width,text:item.str.trim()});}
 return rows.sort((a,b)=>b.y-a.y).map(r=>({...r,items:r.items.sort((a,b)=>a.x-b.x)}));
}
async function read(input){
 const buffer=await fs.readFile(input.path);let ocr;let task;const pages=[];
 const recognize=async image=>{
  if(!ocr)ocr=await createWorker('eng',1,{langPath:language.langPath,gzip:true,cacheMethod:'none',logger:()=>{},errorHandler:()=>{}});
  const {data}=await ocr.recognize(image,{}, {text:true});return {text:data.text.slice(0,40000),confidence:data.confidence};
 };
 try{
  if(input.mime==='application/pdf'){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
   const resource=name=>path.join(pdfRoot,name).replaceAll('\\','/')+'/';
   task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,standardFontDataUrl:resource('standard_fonts'),cMapUrl:resource('cmaps'),cMapPacked:true,wasmUrl:resource('wasm'),verbosity:0});
   const pdf=await task.promise;if(pdf.numPages>10)throw Error('B/L maksimal 10 halaman. Pisahkan dokumen lain dari berkas B/L.');
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n);const content=await page.getTextContent();const rows=rowsFromItems(content.items);const text=rows.map(r=>r.items.map(i=>i.text).join(' ')).join('\n');
    if(text.replace(/\s/g,'').length>=60){pages.push({number:n,method:'PDF_TEXT',width:page.view[2],height:page.view[3],rows,text:text.slice(0,40000)});}
    else{
     if(pdf.numPages>3)throw Error('PDF hasil pindai maksimal 3 halaman per pembacaan. Pisahkan B/L agar semua halaman dapat diperiksa.');
     const natural=page.getViewport({scale:1});const scale=Math.min(2.5,2800/Math.max(natural.width,natural.height),Math.sqrt(4500000/(natural.width*natural.height)));const viewport=page.getViewport({scale});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
     await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result=await recognize(canvas.toBuffer('image/png'));pages.push({number:n,method:'LOCAL_OCR',width:viewport.width,height:viewport.height,rows:[],...result});
    }page.cleanup();
   }
  }else{
   imageBounds(buffer,input.mime);const image=await loadImage(buffer);const scale=Math.min(1,2800/Math.max(image.width,image.height),Math.sqrt(4500000/(image.width*image.height)));const canvas=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);pages.push({number:1,method:'LOCAL_OCR',rows:[],width:canvas.width,height:canvas.height,...await recognize(canvas.toBuffer('image/png'))});
  }
  if(pages.reduce((n,p)=>n+p.text.length,0)>150000)throw Error('Dokumen terlalu kompleks untuk pembacaan otomatis. Gunakan isian manual.');return {pages};
 }finally{if(ocr)await ocr.terminate();if(task)await task.destroy();}
}
process.on('message',async input=>{try{process.send({ok:true,data:await read(input)},()=>process.exit(0));}catch(error){const message=error.name==='PasswordException'?'PDF dilindungi kata sandi. Gunakan salinan tidak terkunci atau isi manual.':error.message;process.send({ok:false,message},()=>process.exit(1));}});
