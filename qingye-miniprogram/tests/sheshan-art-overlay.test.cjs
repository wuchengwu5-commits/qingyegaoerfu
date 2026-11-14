const {test}=require('node:test'),A=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../miniprogram/packages/sheshan-map'),C=require(base+'/atlas-config'),Art=require(base+'/atlas-art'),G=require(base+'/map-core'),Camera=require(base+'/atlas-camera');
const flush=()=>new Promise(r=>setImmediate(r));
test('all 18 display PNGs preserve the original library bytes and native dimensions',()=>{
 const crypto=require('node:crypto');
 for(const [id,spec] of Object.entries(C.art)){
  A.equal(spec.transform,'similarity',id);A.equal(spec.originalPixelsPreserved,true,id);
  A.equal(spec.sourceSha256,spec.displaySha256,'pre-warped image '+id);
  const relative=spec.src.split('/hole-reference-v1/')[1];
  const png=fs.readFileSync(path.resolve(__dirname,'../cloud-assets/hole-reference-v1',relative));
  A.equal(crypto.createHash('sha256').update(png).digest('hex'),spec.sourceSha256,id);
  A.equal(png.readUInt32BE(16),spec.width);A.equal(png.readUInt32BE(20),spec.height);
 }
});
test('drawing uses one uniform scale, rotation and translation without shear',()=>{
 for(const spec of Object.values(C.art)){
  const scales=[],rotations=[],draws=[];
  const ctx={save(){},restore(){},translate(){},rotate(a){rotations.push(a)},scale(x,y){scales.push([x,y])},drawImage(...args){draws.push(args)}};
  const image={};Art.draw(ctx,image,spec,[200,650],[240,120]);
  A.equal(scales.length,1);A.equal(scales[0][0],scales[0][1]);A.equal(rotations.length,1);
  A.deepEqual(draws,[[image,0,0,spec.width,spec.height]]);
  const o=Art.local([100,100],spec),x=Art.local([200,100],spec),y=Art.local([100,200],spec);
  const dx=x.map((v,i)=>v-o[i]),dy=y.map((v,i)=>v-o[i]);
  A.ok(Math.abs(Math.hypot(...dx)-Math.hypot(...dy))<1e-8);
  A.ok(Math.abs(dx[0]*dy[0]+dx[1]*dy[1])<1e-8);
 }
});
test('Sheshan opening views keep the visible art and starting point clear of the dock',()=>{
 const Hud=require(base+'/atlas-hud'),Viewport=require(base+'/atlas-viewport');
 const holes=require(base+'/atlas-data').parse(require(base+'/atlas-catalog'));
 for(const [w,h,safe] of [[320,652,34],[390,758,34],[430,838,34],[844,300,21],[1024,680,20]]){
  for(const hole of holes){
   const spec=C.art[hole.id],frame=spec.contentFrame;
   A.ok(frame);
   const fit=Camera.fit(w,h,holes,hole,hole.tee,hole.target,false,safe,frame);
   const camera=Viewport.constrain(fit,w,h,C.atlas,C.surround.bounds);
   const [x,y]=G.screen(hole.tee,camera,C.atlas);
   const [gx,gy]=G.screen(hole.green,camera,C.atlas);
   const k=Math.hypot(x-gx,y-gy)/640,[left,top,width,height]=frame;
   A.ok(x+left*k>=7.9&&x+(left+width)*k<=w-7.9&&y+top*k>=41.9&&y+(top+height)*k<=h-safe-29.9, 'art clipped '+hole.id+' '+w+'×'+h);
   const dock=Hud.items(w,h,'focus',safe,true).filter(a=>['prev','next','gps','art'].includes(a.key));
   for(const a of dock)A.ok(x-10>=a.x+a.w||x+10<=a.x||y+10<=a.y||y-28>=a.y+a.h,'start covered '+hole.id+' '+w+'×'+h);
   
  }
 }
});
async function page(options={hole:2}){let def;global.Page=p=>def=p;delete require.cache[require.resolve(base+'/atlas')];require(base+'/atlas');const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad(options);await flush();return p;}
test('18 current-library artwork registrations map real painted anchors into GPS display frames at mobile and wide sizes',()=>{
 const refs=Object.fromEntries(require('../../outputs/sheshan-art-integration-20261111/art-sources.json').map(a=>[a.id,a])),holes=require(base+'/atlas-data').parse(require(base+'/atlas-catalog'));
 A.equal(Object.keys(C.art).length,18);
 for(const h of holes){const spec=C.art[h.id],ref=refs[h.id];A.equal(spec.libraryVersion,ref.version_id);A.equal(spec.sourceSha256,ref.sha256);
  const tee=Art.local(spec.tee,spec),green=Art.local(spec.green,spec);A.ok(Math.hypot(...tee)<1e-8);A.ok(Math.hypot(green[0],green[1]+640)<1e-8);
  for(const [w,ht,safe] of [[320,652,34],[390,756,34],[430,844,34],[844,300,21],[1024,680,20]]){const cam=Camera.fit(w,ht,holes,h,h.tee,h.target,false,safe,spec.frame),t=G.screen(h.tee,cam,C.atlas),g=G.screen(h.green,cam,C.atlas);A.ok(t[1]>g[1]);A.ok(Math.abs(t[0]-g[0])<1e-6);const k=Math.hypot(t[0]-g[0],t[1]-g[1])/640;
   for(const pixel of [[0,0],[spec.width,0],[spec.width,spec.height],[0,spec.height]]){const local=Art.local(pixel,spec),p=[t[0]+local[0]*k,t[1]+local[1]*k];A.ok(p[0]>=7.99&&p[0]<=w-7.99&&p[1]>=41.99&&p[1]<=ht-safe-29.99,`hole ${h.number} art clipped at ${w}x${ht}: ${p}`);}
  }
 }
});
test('toggle preserves camera, manual GPS origin, target and distance, and overview never draws artwork',async()=>{
 global.wx={};const p=await page();A.equal(p.preferArt,false);p.width=390;p.height=756;p.safe=34;p.ctx={};p.paint=()=>{};p.camera={x:13,y:16,scale:.8,angle:.6};p.origin=p.origin.map(x=>x+4);p.target=p.target.map(x=>x+2);p.updateDistances();const snapshot=JSON.stringify([p.camera,p.origin,p.target,p.data.center]);p.perform('gps');p.perform('art');A.equal(JSON.stringify([p.camera,p.origin,p.target,p.data.center]),snapshot);p.updateHud();A.ok(p.data.actions.find(a=>a.key==='art'));A.ok(!p.data.actions.find(a=>a.key==='reference'));p.showOverview();p.updateHud();A.ok(!p.data.actions.find(a=>a.key==='art'));p.onUnload();
 const gps=await page({hole:2,layer:'gps'});A.equal(gps.preferArt,false);gps.onUnload();
});
test('late artwork load and failure cannot replace another hole, unloaded view or explicit GPS mode',async()=>{
 global.wx={__preview:true,showToast(){}};const p=await page({hole:2,layer:'art'}),images=[];p.paint=()=>{};p.canvas={createImage(){const i={};images.push(i);return i}};
 p.syncArt();await flush();const stale=images[0];p.activate(3,false);await flush();A.equal(images.length,2);stale.onload();await flush();A.equal(p.artEntry.image,null);images[1].onload();await flush();A.equal(p.artEntry.image,images[1]);p.perform('gps');A.equal(p.preferArt,false);p.activate(4,false);await flush();A.equal(p.artEntry,null);p.perform('art');await flush();images[2].onerror();await flush();A.equal(p.artEntry,null);A.equal(p.preferArt,false);p.perform('art');await flush();A.equal(images.length,4);p.onUnload();images[3].onload();await flush();A.equal(p.artEntry,null);
});
test('GPS registration geometry is byte-for-byte unchanged by overlay integration',()=>{
 const root=path.resolve(__dirname,'../..'),baseline=JSON.parse(fs.readFileSync(root+'/outputs/sheshan-art-integration-20261111/baseline.json'));
 const catalog=require(base+'/atlas-catalog');for(const h of catalog){const before=baseline.document.holes.find(b=>b._id===h._id);for(const key of ['tee','target','green','greenOutline','teeOutline','route','sourceCrop','revision'])A.deepEqual(h[key],before[key]);}
});
