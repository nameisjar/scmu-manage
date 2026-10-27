const {fork}=require('node:child_process');const path=require('node:path');
let busy=false;
async function read(filename,mime){
 if(busy)throw Object.assign(new Error('Pembacaan dokumen lokal sedang berlangsung. Coba lagi setelah selesai.'),{status:429});busy=true;
 try{return await new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'blReaderWorker.cjs'),[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],execArgv:['--max-old-space-size=512'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:'production'}});
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Object.assign(new Error('Pembacaan melebihi batas 90 detik. Gunakan file yang lebih jelas atau isi manual.'),{status:422})),90000);
  child.on('message',result=>result.ok?finish(null,result.data):finish(Object.assign(new Error(result.message||'Dokumen tidak dapat dibaca.'),{status:422})));
  child.on('error',()=>finish(Object.assign(new Error('Pembaca dokumen lokal tidak dapat dijalankan.'),{status:503})));
  child.on('exit',()=>finish(Object.assign(new Error('Pembaca berhenti. Gunakan file yang lebih kecil atau isi manual.'),{status:422})));
  child.send({path:filename,mime});
 });}finally{busy=false;}
}
module.exports={read};
