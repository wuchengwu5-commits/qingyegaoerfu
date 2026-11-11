// Decode at most three images concurrently and retain a bounded image cache.
const manifest=require('./atlas-tiles');
const Media=require('../../services/media');
function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function createLoader(canvas){
 const cache=new Map(),queue=[];let closed=false,active=0,clock=0,peakActive=0;
 function pump(){while(!closed&&active<3&&queue.length){const job=queue.shift();active++;peakActive=Math.max(peakActive,active);job().finally(()=>{active--;pump();});}}
 function obtain(src){
  const old=cache.get(src);if(old){old.used=++clock;return old;}
  const entry={image:null,ready:false,promise:null,used:++clock,pixels:0};cache.set(src,entry);
  entry.promise=new Promise((resolve,reject)=>{entry.reject=reject;queue.push(async()=>{
   if(closed){reject(new Error('closed'));return;}
   try{const path=await Media.local(src);if(closed)throw Error('closed');entry.image=canvas.createImage();
    await new Promise((done,fail)=>{entry.image.onload=done;entry.image.onerror=()=>fail(new Error('image load failed'));entry.image.src=path;});
    if(closed)throw Error('closed');entry.ready=true;entry.pixels=(entry.image.width||1024)*(entry.image.height||1024);resolve(entry.image);
   }catch(error){cache.delete(src);if(!closed)Media.forget(src);reject(error);}
  });pump();});return entry;
 }
 function specs(src,region){const m=manifest[src];return m?m.tiles.filter(t=>!region||intersects(t,region)):[{src}];}
 function ready(src,region){return specs(src,region).every(t=>cache.get(t.src)?.ready);}
 async function load(src,region,options={}){
  if(closed)throw new Error('closed');const m=manifest[src];if(!m)return obtain(src).promise;
  const selected=options.selected||specs(src,region),tiles=new Array(selected.length);let next=0;
  async function worker(){while(next<selected.length){if(closed||options.isCurrent&&!options.isCurrent())throw new Error('stale view');const i=next++,t=selected[i];tiles[i]={...t,image:await obtain(t.src).promise};}}
  await Promise.all(Array.from({length:Math.min(3,selected.length)},worker));return {width:m.width,height:m.height,tiles};
 }
 function trim(keep=new Set()){
  let pixels=Array.from(cache.values()).reduce((n,e)=>n+e.pixels,0);
  for(const [src,e] of [...cache].sort((a,b)=>a[1].used-b[1].used)){if(pixels<=12*1024*1024)break;if(!e.ready||keep.has(src))continue;cache.delete(src);pixels-=e.pixels;}
 }
 return {load,ready,specs,trim,stats(){return{entries:cache.size,decodedPixels:Array.from(cache.values()).reduce((n,e)=>n+e.pixels,0),active,peakActive}},close(){closed=true;queue.length=0;for(const e of cache.values())if(!e.ready)e.reject(new Error('closed'));cache.clear();}};
}
function draw(ctx,image,sx,sy,sw,sh,dx,dy,dw,dh){
 if(!image)return;if(!image.tiles){ctx.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
 if(image.preview){const x=image.previewWidth/image.width,y=image.previewHeight/image.height;ctx.drawImage(image.preview,sx*x,sy*y,sw*x,sh*y,dx,dy,dw,dh);}
 for(const t of image.tiles){
  const x=Math.max(sx,t.x),y=Math.max(sy,t.y),r=Math.min(sx+sw,t.x+t.width),b=Math.min(sy+sh,t.y+t.height);
  if(r<=x||b<=y)continue;
  ctx.drawImage(t.image,x-t.left,y-t.top,r-x,b-y,dx+(x-sx)*dw/sw,dy+(y-sy)*dh/sh,(r-x)*dw/sw,(b-y)*dh/sh);
 }
}
module.exports={createLoader,draw,intersects};
