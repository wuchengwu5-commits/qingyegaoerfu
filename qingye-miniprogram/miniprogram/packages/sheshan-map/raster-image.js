// JPEG tiles retain source pixel coordinates. Only tiles intersecting the current
// hole are decoded; opening the overview requests the complete image.
const manifest=require('./image-tiles');
const Media=require('../../services/media');
function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function createLoader(canvas){
 const cache=new Map();let closed=false;
 function obtain(src){
  const old=cache.get(src);if(old)return old;
  const entry={image:canvas.createImage(),ready:false,promise:null};cache.set(src,entry);
  entry.promise=new Promise((resolve,reject)=>{
   entry.image.onload=()=>{if(closed)return reject(new Error('closed'));entry.ready=true;resolve(entry.image);};
   entry.image.onerror=()=>{cache.delete(src);Media.forget(src);reject(new Error('image load failed'));};
   Media.local(src).then(path=>{if(closed)return reject(new Error('closed'));entry.image.src=path;},error=>{cache.delete(src);reject(error);});
  });return entry;
 }
 function specs(src,region){const m=manifest[src];return m?m.tiles.filter(t=>!region||intersects(t,region)):[{src}];}
 function ready(src,region){return specs(src,region).every(t=>cache.get(t.src)?.ready);}
 async function load(src,region){
  if(closed)throw new Error('closed');const m=manifest[src];if(!m)return obtain(src).promise;
  const selected=specs(src,region),tiles=new Array(selected.length);let next=0;
  // Bound decoding concurrency to avoid a burst of full-resolution decoders.
  async function worker(){while(next<selected.length){if(closed)throw new Error('closed');const i=next++,t=selected[i];tiles[i]={...t,image:await obtain(t.src).promise};}}
  await Promise.all(Array.from({length:Math.min(4,selected.length)},worker));
  return {width:m.width,height:m.height,tiles};
 }
 return {load,ready,close(){closed=true;cache.clear();}};
}
function draw(ctx,image,sx,sy,sw,sh,dx,dy,dw,dh){
 if(!image)return;if(!image.tiles){ctx.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
 for(const t of image.tiles){
  const x=Math.max(sx,t.x),y=Math.max(sy,t.y),r=Math.min(sx+sw,t.x+t.width),b=Math.min(sy+sh,t.y+t.height);
  if(r<=x||b<=y)continue;
  ctx.drawImage(t.image,x-t.left,y-t.top,r-x,b-y,dx+(x-sx)*dw/sw,dy+(y-sy)*dh/sh,(r-x)*dw/sw,(b-y)*dh/sh);
 }
}
module.exports={createLoader,draw,intersects};
