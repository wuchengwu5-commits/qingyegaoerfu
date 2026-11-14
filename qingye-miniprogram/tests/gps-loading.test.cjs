const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),Stream=require(root+'/templates/map-ui/atlas-stream');
const turn=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function stream(load,onChange,onError=()=>{}){
 return Stream.create({canvas:{},Raster:{createLoader:()=>({load,close(){},trim(){}})},atlas:{width:1000,height:1000},photo:'atlas',levels:{atlas:'atlas',sourceSurround:'area',overview:{src:'small',width:100,height:100},surround:{src:'area-small',width:100,height:100}},context:{src:'area',bounds:{}},onChange,onError});
}
test('a stalled surrounding download cannot block the first usable overview',async()=>{
 const wait=deferred(),frames=[],s=stream(src=>src==='small'?Promise.resolve({width:100,height:100}):wait.promise,(...args)=>frames.push(args));
 let complete=false;const starting=s.start().then(()=>complete=true);await turn();A.equal(complete,true);A.equal(frames.length,1);A.equal(frames[0][1],null);
 wait.resolve({width:100,height:100});await turn();A.equal(frames.length,2);A.ok(frames[1][1]);await starting;s.close();
});
test('surrounding success alone cannot clear a failed overview and late work cannot publish after close',async()=>{
 let errors=0,frames=0;const s=stream(src=>src.startsWith('area')?Promise.resolve({width:1,height:1}):Promise.reject(Error('offline')),()=>frames++,()=>errors++);
 await s.start();A.equal(errors,1);A.equal(frames,0);s.close();
 const wait=deferred(),s2=stream(src=>src==='small'?Promise.resolve({width:1,height:1}):wait.promise,()=>frames++);await s2.start();s2.close();const n=frames;wait.resolve({width:1,height:1});await turn();A.equal(frames,n);
});
function timers(){let n=0;const items=new Map();return {setTimeout:(fn,ms)=>{items.set(++n,{fn,ms});return n;},clearTimeout:id=>items.delete(id),fire(ms){for(const[id,t]of [...items])if(t.ms===ms){items.delete(id);t.fn();}},items};}
function media(){
 const clock=timers(),download=[],files=new Set(),wx={env:{USER_DATA_PATH:'/user'},cloud:{downloadFile(q){download.push(q);return {abort(){q.aborted=true;}};},callFunction:()=>new Promise(()=>{})},getFileSystemManager:()=>({accessSync(p){if(!files.has(p))throw Error('missing');},mkdirSync(){},writeFile(q){files.add(q.filePath);q.success();},copyFile(q){files.add(q.destPath);q.success();}})};
 const module={exports:{}},cache={forget(){},touch(){},stored(){},trim:async()=>{},stats(){}};
 vm.runInNewContext(fs.readFileSync(root+'/qingye-miniprogram/miniprogram/services/media.js','utf8'),{module,wx,Date,...clock,require:id=>id==='../config'?{mediaEnv:'env',mediaRoot:'cloud://env.bucket/media-v1'}:id==='./media-cache'?cache:{init(){}}});
 return {m:module.exports,wx,clock,download,files};
}
test('stalled direct and fallback requests terminate, release the shared promise and allow a fresh attempt',async()=>{
 const x=media(),src='/packages/test-map/overview-fast.jpg',first=x.m.local(src),check=A.rejects(first,/超时/);
 x.clock.fire(6500);await turn();A.equal(x.download[0].aborted,true);x.clock.fire(8000);await check;A.equal(x.files.size,0);
 const retry=x.m.local(src);x.download[1].success({tempFilePath:'/temp/good'});A.match(await retry,/qingye-media/);A.equal(x.clock.items.size,0);
 // The first request completing late cannot overwrite the successful retry.
 x.download[0].success({tempFilePath:'/temp/stale'});A.equal(await x.m.local(src),await retry);
});
test('a late cloud image chunk after timeout cannot write a stale cache entry',async()=>{
 const x=media(),late=deferred();x.wx.cloud.callFunction=()=>late.promise;
 const pending=x.m.local('/packages/test-map/overview-fast.jpg'),check=A.rejects(pending,/超时/);x.download[0].fail(Error('access denied'));await turn();x.clock.fire(8000);await check;
 late.resolve({result:{ok:true,index:0,chunks:1,data:'/9j/AA=='}});await turn();A.equal(x.files.size,0);
});
test('a canvas image with no load/error callback times out and frees its decoder for retry',async()=>{
 const clock=timers(),module={exports:{}},forgotten=[];
 vm.runInNewContext(fs.readFileSync(root+'/templates/gps-atlas/atlas-raster.js','utf8'),{module,...clock,require:id=>id==='./atlas-tiles'?{}:{local:async s=>s,forget:s=>forgotten.push(s)}});
 let decode=false;const loader=module.exports.createLoader({createImage(){const img={width:1,height:1};Object.defineProperty(img,'src',{set(){if(decode)queueMicrotask(()=>img.onload());}});return img;}});
 const pending=loader.load('image'),check=A.rejects(pending,/解码超时/);await turn();clock.fire(8000);await check;await turn();A.equal(loader.stats().active,0);A.equal(forgotten.length,1);
 decode=true;await loader.load('image');A.equal(loader.ready('image'),true);loader.close();A.equal(clock.items.size,0);
});
