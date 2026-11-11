const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram/packages'),Viewport=require('../../templates/map-ui/atlas-viewport'),Hud=require('../../templates/map-ui/atlas-hud');
const suzhou=Object.values(require('../miniprogram/services/suzhou-gps-maps'));
const sizes=[[320,740,34],[390,753,34],[430,920,34],[844,300,21],[1024,680,20],[1440,760,0]];
function coverage(c,w,h,a,b,G){for(const p of [[0,0],[w,0],[0,h],[w,h]]){const q=G.world(p,c,a);A.ok(q[0]>=b[0]-.01&&q[1]>=b[1]-.01&&q[0]<=b[2]+.01&&q[1]<=b[3]+.01,'screen corner outside geographic context '+q);}}
test('all registered GPS atlases have real expanded surroundings aligned to their detail extent',()=>{
 let count=0;for(const key of fs.readdirSync(base)){const file=path.join(base,key,'atlas-config.js');if(!fs.existsSync(file)&&key!=='tianma-map')continue;const C=key==='tianma-map'?{atlas:require(base+'/'+key+'/overview-data'),surround:require(base+'/'+key+'/atlas-context')}:require(file),a=C.atlas,s=C.surround,e=a.extent;A.ok(s?.extent,key+' georeferenced surrounding image');A.ok(s.bounds[0]<0&&s.bounds[1]<0&&s.bounds[2]>a.width&&s.bounds[3]>a.height,key+' expanded image');const projected=[e.xmin+s.bounds[0]*(e.xmax-e.xmin)/a.width,e.ymax-s.bounds[3]*(e.ymax-e.ymin)/a.height,e.xmin+s.bounds[2]*(e.xmax-e.xmin)/a.width,e.ymax-s.bounds[1]*(e.ymax-e.ymin)/a.height];for(let i=0;i<4;i++)A.ok(Math.abs(projected[i]-[s.extent.xmin,s.extent.ymin,s.extent.xmax,s.extent.ymax][i])<.001,key+' alignment');A.ok(fs.existsSync(path.resolve(base,'../../cloud-assets/media-v1')+s.src));count++;}A.equal(count,19+suzhou.length);
});
test('portrait, landscape, resized, rotated and extreme pan/zoom cameras never expose raster edges',async()=>{
 let holesTested=0;for(const key of fs.readdirSync(base)){const file=path.join(base,key,'atlas-config.js');if(!fs.existsSync(file))continue;const C=require(file),G=require(base+'/'+key+'/map-core'),K=require(base+'/'+key+'/atlas-camera');global.wx={};const holes=require(base+'/'+key+'/atlas-data').parse(require(base+'/'+key+'/atlas-catalog'));holesTested+=holes.length;
  for(const [w,h,safe] of sizes){const all=holes.length?holes:[null];for(const hole of all){const mode=!hole;const cam=K.fit(w,h,holes,hole,hole?.tee,hole?.target,mode,safe),fixed=Viewport.constrain(cam,w,h,C.atlas,C.surround.bounds);coverage(fixed,w,h,C.atlas,C.surround.bounds,G);if(hole)A.ok(Math.abs(fixed.scale-cam.scale)<1e-9,key+' initial view should retain full hole');else for(const p of require(base+'/'+key+'/atlas-boundary').outer){const [x,y]=G.screen(p,fixed,C.atlas);A.ok(x>=0&&x<=w&&y>=0&&y<=h,key+' initial view should retain the course');}}
   const overview=K.fit(w,h,holes,holes[0],holes[0]?.tee,holes[0]?.target,true,safe),cam=Viewport.constrain(overview,w,h,C.atlas,C.surround.bounds);coverage(cam,w,h,C.atlas,C.surround.bounds,G);
   for(const angle of [0,.7,Math.PI/2,2.7])for(const delta of [-1e6,1e6]){const small={...cam,angle,x:delta,y:-delta,scale:Math.min(w/C.atlas.width,h/C.atlas.height)*.01};coverage(Viewport.constrain(small,w,h,C.atlas,C.surround.bounds),w,h,C.atlas,C.surround.bounds,G);}
  }
 }A.equal(holesTested,360+suzhou.reduce((total,course)=>total+course.gpsHoles,0));
});
test('Tianma controls stay inside safe areas and separate their touch regions on wide screens',()=>{
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 for(const [w,h,safe] of sizes)for(const mode of ['overview','focus'])for(const variant of [[false,false],[true,false],[false,true]]){const items=Hud.items(w,h,mode,safe,...variant);for(const a of items)A.ok(a.x>=0&&a.y>=0&&a.x+a.w<=w&&a.y+a.h<=h-safe,a.key+' '+w+'x'+h);for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)A.ok(!overlaps(items[i],items[j]),items[i].key+' / '+items[j].key+' '+w+'x'+h);}
});
