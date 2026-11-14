const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),base=root+'/miniprogram',flush=()=>new Promise(r=>setImmediate(r));
function loadPage(file){
 let def;vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:p=>def=p,require:createRequire(file),wx:{},setTimeout,clearTimeout});
 return {...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)},fetchHoles(){},paint(){}};
}
test('every atlas defaults to GPS without a layer parameter, including every available artwork hole',()=>{
 const app=require(base+'/app.json');let count=0;
 for(const pkg of app.subPackages)for(const name of pkg.pages){
  const file=path.join(base,pkg.root,name+'.js');
  if(!fs.readFileSync(file,'utf8').includes('syncArt(){'))continue;
  const requireFrom=createRequire(file),config=pkg.root.endsWith('/tianma-map')?{art:requireFrom('./atlas-art-data')}:requireFrom('./atlas-config');
  for(const options of [{},{hole:1},{view:'focus'}, {hole:1,layer:'gps'}]){
   const p=loadPage(file);p.onLoad(options);p.canvas={createImage(){throw Error('default GPS must not decode art')}};
   A.equal(p.preferArt,false,file+' '+JSON.stringify(options));p.data.mode='focus';
   for(const id of Object.keys(config.art||{unillustrated:{}})){
    p.hole={id};p.syncArt();A.equal(p.artEntry,undefined,file+' '+id);
   }
  }
  count++;
 }
 A.ok(count>=29);
});
test('leaving artwork for GPS or overview releases its loader and ignores late failure',async()=>{
 const file=base+'/packages/tianma-map/trial.js',p=loadPage(file);p.onLoad({hole:22});p.hole={id:'cn_bg_577_s3_h04'};p.canvas={};p.data.mode='focus';
 const Raster=require(base+'/packages/tianma-map/raster-image'),old=Raster.createLoader;let attempts=0,closes=0,reject;
 Raster.createLoader=()=>({load(){attempts++;return new Promise((_,r)=>reject=r)},close(){closes++}});
 try{
  p.syncArt();A.equal(attempts,0);p.perform('art');A.equal(attempts,1);
  p.perform('gps');A.equal(p.artEntry,null);A.equal(closes,1);reject(Error('late error'));await flush();A.equal(p.preferArt,false);
  p.perform('art');A.equal(attempts,2);p.data.mode='overview';p.syncArt();A.equal(p.artEntry,null);A.equal(closes,2);
  reject(Error('late overview error'));await flush();p.data.mode='focus';p.syncArt();A.equal(attempts,3);
  p.onUnload();reject(Error('unloaded'));await flush();
 }finally{Raster.createLoader=old;}
});
function cloudFunction(){
 const calls=[],caller={APPID:'wx771368adc305a848',OPENID:'ordinary-viewer'},png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(720000,7)]);
 let bytes=png;
 const cloud={DYNAMIC_CURRENT_ENV:'test',init(){},getWXContext:()=>caller,database:()=>({}),downloadFile:async o=>{calls.push(o);return {fileContent:bytes}}},exports={};
 vm.runInNewContext(fs.readFileSync(root+'/cloudfunctions/qingyeGpsMaps/index.js','utf8'),{exports,Buffer,require:id=>{A.equal(id,'wx-server-sdk');return cloud}});
 return {main:exports.main,calls,caller,png,setBytes:b=>bytes=b};
}
const name='cn_bg_577/cn_bg_577_s3_h04-5c9193969f855c8f.png';
test('ordinary miniapp users can fetch public PNG artwork in complete base64 chunks',async()=>{
 const s=cloudFunction(),parts=[];
 for(let index=0;index<2;index++){
  const p=await s.main({action:'referenceImage',name,index});A.equal(p.ok,true);A.equal(p.index,index);A.equal(p.chunks,2);parts.push(p.data);
 }
 A.deepEqual(Buffer.from(parts.join(''),'base64'),s.png);
 A.ok(s.calls.every(o=>o.fileID.endsWith('/hole-reference-v1/'+name)));
});
test('artwork fallback cannot read account files, arbitrary URLs, other courses or invalid image bytes',async()=>{
 const s=cloudFunction();
 for(const bad of ['../profiles/a.png','cloud://other/file.png','cn_bg_577/../../profiles/a.png',name.replace('/cn_bg_577_','/cn_bg_611_'),name+'?x',name.replace('.png','.json')])A.equal((await s.main({action:'referenceImage',name:bad,index:0})).ok,false,bad);
 for(const index of [-1,8,1.5,'0'])A.equal((await s.main({action:'referenceImage',name,index})).ok,false);
 A.equal(s.calls.length,0);s.caller.OPENID='';A.equal((await s.main({action:'referenceImage',name,index:0})).ok,false);A.equal(s.calls.length,0);
 s.caller.OPENID='viewer';s.setBytes(Buffer.from('not an image'));A.equal((await s.main({action:'referenceImage',name,index:0})).ok,false);
});
