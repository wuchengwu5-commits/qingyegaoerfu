// Only disposable, downloaded image files in our own directory are managed here.
// Scores, account storage, user files and source library data are never touched.
const LIMIT=48*1024*1024,TARGET=40*1024*1024;
let state=null;
function owned(name){try{const src=decodeURIComponent(name);return /^\/packages\/.*\.jpe?g$/i.test(src)||/^\/assets\/(course-[0-2]\.jpg|spring-lake\.webp)$/.test(src)||/^cloud:\/\/.+\/(backgrounds-v1|course-thumbs-v1|hole-reference-v1|hole-gps-v1)\//.test(src);}catch(_){return false;}}
function get(){
 if(typeof wx==='undefined'||wx.__preview||!wx.env||!wx.getFileSystemManager)return null;
 const root=wx.env.USER_DATA_PATH+'/qingye-media-v1';if(state?.root===root)return state;
 const fs=wx.getFileSystemManager();if(!fs.readdir||!fs.stat||!fs.unlink)return null;
 let entries={};try{const saved=JSON.parse(fs.readFileSync(root+'/.cache-index.json','utf8'));for(const[n,e]of Object.entries(saved))if(owned(n)&&Number.isFinite(e.bytes)&&Number.isFinite(e.at))entries[n]=e;}catch(_){}
 return state={root,fs,entries,scanned:false,running:null,timer:null,removed:0};
}
function call(fs,method,args){return new Promise((resolve,reject)=>fs[method]({...args,success:resolve,fail:reject}));}
async function scan(s){
 let names;try{names=(await call(s.fs,'readdir',{dirPath:s.root})).files.filter(owned);}catch(_){s.scanned=true;return;}
 const live=new Set(names);for(const n of Object.keys(s.entries))if(!live.has(n))delete s.entries[n];let next=0;
 async function worker(){while(next<names.length){const name=names[next++];if(s.entries[name]?.bytes>0)continue;try{const r=await call(s.fs,'stat',{path:s.root+'/'+name});s.entries[name]={bytes:r.stats.size,at:s.entries[name]?.at||0};}catch(_){}}}
 await Promise.all(Array.from({length:4},worker));s.scanned=true;
}
async function trim(){
 const s=get();if(!s)return;if(s.running)return s.running;clearTimeout(s.timer);s.timer=null;
 s.running=(async()=>{
  if(!s.scanned)await scan(s);
  let total=Object.values(s.entries).reduce((n,e)=>n+e.bytes,0);
  if(total>LIMIT){const recent=Date.now()-10000;for(const[name,e]of Object.entries(s.entries).sort((a,b)=>a[1].at-b[1].at)){if(total<=TARGET)break;if(e.at>recent)continue;try{await call(s.fs,'unlink',{filePath:s.root+'/'+name});delete s.entries[name];total-=e.bytes;s.removed++;}catch(_){}}}
  if(s.fs.writeFile)try{await call(s.fs,'writeFile',{filePath:s.root+'/.cache-index.json',data:JSON.stringify(s.entries),encoding:'utf8'});}catch(_){}
 })().finally(()=>{s.running=null;});return s.running;
}
function schedule(s){if(!s.timer){s.timer=setTimeout(()=>{s.timer=null;trim().catch(()=>{});},500);s.timer.unref?.();}}
function touch(src){const s=get();if(!s)return;const n=encodeURIComponent(src);if(!owned(n))return;s.entries[n]={bytes:s.entries[n]?.bytes||0,at:Date.now()};schedule(s);}
function stored(src,size){const s=get();if(!s)return;const n=encodeURIComponent(src);if(!owned(n))return;const old=s.entries[n];s.entries[n]={bytes:Number.isFinite(size)?size:old?.bytes||0,at:Date.now()};if(!size)s.scanned=false;schedule(s);}
function forget(src){const s=get();if(s)delete s.entries[encodeURIComponent(src)];}
function stats(){const s=get();return s?{limitBytes:LIMIT,bytes:Object.values(s.entries).reduce((n,e)=>n+e.bytes,0),entries:Object.keys(s.entries).length,removed:s.removed}:null;}
module.exports={touch,stored,forget,trim,stats,owned};
