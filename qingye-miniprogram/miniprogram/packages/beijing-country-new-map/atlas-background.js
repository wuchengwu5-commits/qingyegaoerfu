// The detail and geographic surroundings share one transform and one mask.
// Feather only the detail image edge; course geometry never moves with blending.
function drawRaw(ctx,model,Raster,Perimeter,Geo){
 const {width,height,atlas,image,camera,surround,mode}=model;
 const corners=[[0,0],[width,0],[0,height],[width,height]].map(p=>Geo.world(p,camera,atlas));
 const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
 const visible=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);ctx.rotate(camera.angle);ctx.translate(-atlas.width/2,-atlas.height/2);
 if(surround){const b=surround.bounds;ctx.drawImage(surround.image,b[0],b[1],b[2]-b[0],b[3]-b[1]);}
 const edge=Math.min(atlas.width,atlas.height)*.03,bands=8;
 function part(x,y,w,h,alpha){
  const l=Math.max(x,visible[0]),t=Math.max(y,visible[1]);
  const r=Math.min(x+w,visible[2]),b=Math.min(y+h,visible[3]);
  if(r<=l||b<=t)return;
  ctx.globalAlpha=alpha;Raster.draw(ctx,image,l,t,r-l,b-t,l,t,r-l,b-t);
 }
 part(edge,edge,atlas.width-2*edge,atlas.height-2*edge,1);
 for(let i=0;i<bands;i++){
  const d=edge*i/bands,step=edge/bands,alpha=(i+.5)/bands;
  part(d,d,atlas.width-2*d,step,alpha);
  part(d,atlas.height-d-step,atlas.width-2*d,step,alpha);
  part(d,d+step,step,atlas.height-2*d-2*step,alpha);
  part(atlas.width-d-step,d+step,step,atlas.height-2*d-2*step,alpha);
 }
 ctx.globalAlpha=1;
 Perimeter.draw(ctx,visible,camera.scale,mode==='overview',model.tintViewportHeight);ctx.restore();
}
// Keep a small overscanned, display-resolution background between frames. Pins,
// distances and controls remain live vectors; a pan reuses the same geography.
const caches=new WeakMap();
function release(ctx){if(ctx)caches.delete(ctx);}
function draw(ctx,model,Raster,Perimeter,Geo){
 if(typeof wx==='undefined'||!wx.createOffscreenCanvas)return drawRaw(ctx,model,Raster,Perimeter,Geo);
 const {width,height,camera,image,surround,mode}=model,pad=64;
 const ratio=Math.min(model.pixelRatio||1,2,Math.sqrt(5000000/((width+2*pad)*(height+2*pad))));
 let cached=caches.get(ctx);
 const valid=cached&&cached.width===width&&cached.height===height&&cached.ratio===ratio&&cached.image===image&&cached.revision===(image.revision||0)&&cached.surround===surround?.image&&cached.mode===mode&&cached.scale===camera.scale&&cached.angle===camera.angle&&Math.abs(cached.x-camera.x)<=pad-8&&Math.abs(cached.y-camera.y)<=pad-8;
 try{
  if(!valid){
   const w=Math.ceil((width+2*pad)*ratio),h=Math.ceil((height+2*pad)*ratio);
   const canvas=cached?.canvas?.width===w&&cached?.canvas?.height===h?cached.canvas:wx.createOffscreenCanvas({type:'2d',width:w,height:h});
   const off=canvas.getContext('2d');off.setTransform(ratio,0,0,ratio,0,0);off.clearRect(0,0,width+2*pad,height+2*pad);
   const tintViewportHeight=(Math.abs(Math.sin(camera.angle))*width+Math.abs(Math.cos(camera.angle))*height)/camera.scale;
   drawRaw(off,{...model,width:width+2*pad,height:height+2*pad,camera:{...camera,x:camera.x+pad,y:camera.y+pad},tintViewportHeight},Raster,Perimeter,Geo);
   cached={canvas,width,height,ratio,image,revision:image.revision||0,surround:surround?.image,mode,scale:camera.scale,angle:camera.angle,x:camera.x,y:camera.y};caches.set(ctx,cached);
  }
  const x=(pad-(camera.x-cached.x))*ratio,y=(pad-(camera.y-cached.y))*ratio;
  ctx.drawImage(cached.canvas,x,y,width*ratio,height*ratio,0,0,width,height);
 }catch(_){release(ctx);drawRaw(ctx,model,Raster,Perimeter,Geo);}
}
module.exports={draw,release};
