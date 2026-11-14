// Progressive imagery keeps original atlas coordinates, extents and GPS geometry.
// Only the latest settled viewport may publish high-resolution tiles.
function create({canvas,Raster,Geo,atlas,photo,levels,context,onChange,onError,onDetailError}){
 const loader=Raster.createLoader(canvas);let closed=false,paused=false,base=null,area=null,wanted=null,timer=null,busy=false,version=0,key='',failed=false;
 const firstSources=new Set();
 function current(v){return !closed&&!paused&&v===version;}
 function publish(){if(!closed&&!paused&&base)onChange(base,area?{image:area,bounds:context.bounds}:null);}
 async function small(level,fallback){
  try{
   const image=await loader.load(level.src);
   firstSources.add(level.src);
   return {image,width:level.width,height:level.height};
  }catch(error){
   if(closed||level.src===fallback)throw error;
   const image=await loader.load(fallback);
   firstSources.add(fallback);
   return {image,width:image.width,height:image.height};
  }
 }
 async function start(){
  try{
   if(levels.atlas!==photo||levels.sourceSurround!==context.src)throw Error('image level mismatch');
   // Surroundings enhance the map, but must never hold its first frame hostage.
   small(levels.surround,context.src).then(surround=>{
    if(closed)return;area=surround.image;publish();
   }).catch(()=>{});
   const overview=await small(levels.overview,photo);
   if(closed)return;
   const preview=overview.image;
   base=preview.tiles?preview:{width:atlas.width,height:atlas.height,preview,previewWidth:overview.width,previewHeight:overview.height,tiles:[],revision:0};
   publish();
  }catch(e){if(!closed)onError(e);}
 }
 function region(camera,width,height){
  const points=[[0,0],[width,0],[0,height],[width,height]].map(p=>Geo.world(p,camera,atlas)),pad=48/camera.scale;
  const x=Math.max(0,Math.min(...points.map(p=>p[0]))-pad),y=Math.max(0,Math.min(...points.map(p=>p[1]))-pad);
  const right=Math.min(atlas.width,Math.max(...points.map(p=>p[0]))+pad),bottom=Math.min(atlas.height,Math.max(...points.map(p=>p[1]))+pad);
  return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
 }
 function refresh(camera,width,height,ratio=2,force=false){
  if(closed||paused||!base||!camera)return;
  const rect=region(camera,width,height),high=camera.scale*Math.min(2,ratio)>(base.previewWidth||levels.overview.width)/atlas.width*1.15;
  const selected=high?loader.specs(photo,rect).sort((a,b)=>Math.hypot(a.x+a.width/2-rect.x-rect.width/2,a.y+a.height/2-rect.y-rect.height/2)-Math.hypot(b.x+b.width/2-rect.x-rect.width/2,b.y+b.height/2-rect.y-rect.height/2)).slice(0,8):[];
  const next=selected.map(t=>t.src).sort().join('|');if(next===key&&!force&&!failed)return;
  key=next;failed=false;const v=++version;clearTimeout(timer);timer=null;wanted={selected,v};
  // Keep the low-resolution whole image underneath while the new viewport loads.
  if(base.preview){const keep=new Set(selected.map(t=>t.src));base.tiles=base.tiles.filter(t=>keep.has(t.src));base.revision++;publish();}
  loader.trim(new Set([...firstSources,...selected.map(t=>t.src)]));
  if(!selected.length){wanted=null;return;}
  timer=setTimeout(pump,100);
 }
 async function pump(){
  timer=null;if(closed||paused||busy||!wanted)return;const task=wanted;wanted=null;busy=true;
  try{
   const image=await loader.load(photo,null,{selected:task.selected,isCurrent:()=>current(task.v)});
   if(current(task.v)){if(base.preview){base.tiles=image.tiles;base.revision++;}else base=image;publish();onDetailError?.(null);}
  }catch(e){if(current(task.v)){failed=true;onDetailError?.(e);}}
  finally{busy=false;loader.trim(new Set([...firstSources,...(base?.tiles||[]).map(t=>t.src)]));if(wanted&&!closed&&!paused)timer=setTimeout(pump,100);}
 }
 return {loader,start,refresh,isIdle(){return !busy&&!wanted&&!timer;},pause(){paused=true;version++;clearTimeout(timer);timer=null;wanted=null;key='';},resume(){paused=false;publish();},retry(){key='';failed=false;},close(){closed=true;version++;clearTimeout(timer);timer=null;wanted=null;base=null;area=null;loader.close();}};
}
module.exports={create};
