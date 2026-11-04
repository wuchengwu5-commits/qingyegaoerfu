'use strict';
const D=HoleMapData,M=HoleMapCore,$=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d'),stage=$('stage');
const state={origin:D.defaultOrigin.slice(),target:D.defaultTarget.slice(),originLabel:'图上起点',layer:'enhanced',unit:'yd',camera:null};
const photo=new Image();let width=1,height=1,baseScale=1,toastTimer,raf,locationRequest=0;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4300);}
function fit(){state.camera=M.focusFit(width,height,D);baseScale=state.camera.scale;draw();}
function resize(){const box=stage.getBoundingClientRect();width=box.width;height=box.height;const dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);fit();}
function draw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{M.draw(ctx,photo.complete&&photo.naturalWidth?photo:null,width,height,state,D);updateValues();});}
function updateValues(){const m=M.measure(state,D);for(const key of ['front','center','back'])$(key).textContent=M.value(m[key],state.unit);$('unitLabel').textContent=state.unit==='yd'?'码':'米';}
function loadRoundContext(){
  try{const prefix=new URLSearchParams(location.search).has('qa')?'qingye.h5.qa':'qingye.h5',mode=localStorage.getItem(prefix+'.mode')||'demo',db=JSON.parse(localStorage.getItem(prefix+'.'+mode+'.v3')||'null'),rid=new URLSearchParams(location.search).get('round'),round=rid?db?.rounds?.find(r=>r.id===rid):db?.rounds?.find(r=>r.status==='active');
    if(round?.courseId!=='cn_bg_585')return;
    const player=round.players?.find(p=>p.id===round.currentPlayer)||round.players?.[0],tee=player?.tee||'',key=tee.toLowerCase(),match=[['black','黑','#303a31'],['blue','蓝','#5d87aa'],['white','白','#f9faf3'],['red','红','#be7370'],['gold','金','#b6a16a'],['yellow','黄','#b6a16a']].find(([en,zh])=>key.includes(en)||tee.includes(zh));
    state.unit=round.distanceUnit==='m'?'m':'yd';$('teeLabel').textContent=tee?(match?match[1]+' Tee':tee):'Tee 未设置';$('teeDot').hidden=!tee;$('teeDot').style.background=match?.[2]||'#a8b19a';
  }catch{ /* Keep the neutral preview if no readable round is available. */ }
}
function selectAt(point){const p=M.world(point,state.camera,D);if(!M.inBounds(p,D))return toast('请在影像范围内选点');state.target=p;draw();}
function zoom(factor,p=[width/2,height/2]){M.zoomCamera(state.camera,factor,p,D,baseScale,baseScale*5);constrain();draw();}
function constrain(){const c=state.camera;c.x=Math.max(width*.2-D.width*c.scale/2,Math.min(width*.8+D.width*c.scale/2,c.x));c.y=Math.max(height*.2-D.height*c.scale/2,Math.min(height*.8+D.height*c.scale/2,c.y));}
function local(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
const pointers=new Map();let gesture=null,pinching=false;
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=local(e);pointers.set(e.pointerId,p);if(pointers.size===2){pinching=true;const a=[...pointers.values()];gesture={type:'pinch',length:Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])};return;}const op=M.screen(state.origin,state.camera,D),tp=M.screen(state.target,state.camera,D),od=Math.hypot(op[0]-p[0],op[1]-p[1]),td=Math.hypot(tp[0]-p[0],tp[1]-p[1]),type=od<24&&od<td?'origin':td<24?'target':'pan';if(type==='origin')locationRequest++;gesture={type,start:p,last:p,moved:false};});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=local(e);pointers.set(e.pointerId,p);if(pointers.size===2){const a=[...pointers.values()],length=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(gesture.length>0)zoom(length/gesture.length,[(a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2]);gesture.length=length;return;}if(pinching)return;if(Math.hypot(p[0]-gesture.start[0],p[1]-gesture.start[1])>5)gesture.moved=true;if(!gesture.moved)return;if(gesture.type==='target'||gesture.type==='origin'){const q=M.world(p,state.camera,D);if(M.inBounds(q,D)){state[gesture.type]=q;if(gesture.type==='origin'){state.accuracy=null;state.originLabel='图上起点';}}}else{state.camera.x+=p[0]-gesture.last[0];state.camera.y+=p[1]-gesture.last[1];constrain();}gesture.last=p;draw();});
function end(e,cancel=false){if(!pointers.has(e.pointerId))return;const p=local(e);pointers.delete(e.pointerId);if(!pinching&&!cancel&&gesture&&!gesture.moved&&gesture.type==='pan')selectAt(p);if(pointers.size===0){gesture=null;pinching=false;}}
canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),local(e));},{passive:false});
canvas.addEventListener('keydown',e=>{const v={ArrowLeft:[-3,0],ArrowRight:[3,0],ArrowUp:[0,-3],ArrowDown:[0,3]}[e.key];if(v){e.preventDefault();const p=[state.target[0]+v[0],state.target[1]+v[1]];if(M.inBounds(p,D)){state.target=p;draw();}}if(e.key==='+'||e.key==='=')zoom(1.3);if(e.key==='-')zoom(1/1.3);});
$('layerBtn').onclick=()=>{state.layer=state.layer==='enhanced'?'satellite':'enhanced';$('layerBtn').textContent=state.layer==='enhanced'?'卫星图':'精修图';draw();};
$('resetBtn').onclick=()=>{locationRequest++;state.origin=D.defaultOrigin.slice();state.target=D.defaultTarget.slice();state.originLabel='图上起点';state.accuracy=null;fit();};
$('locateBtn').onclick=()=>{
  if(!navigator.geolocation)return toast('此浏览器不支持定位，请在图上设起点');
  const request=++locationRequest;toast('正在获取位置…');
  navigator.geolocation.getCurrentPosition(res=>{
    if(request!==locationRequest)return;
    const {longitude,latitude,accuracy}=res.coords,p=M.toPixel([longitude,latitude],D);
    if(!M.inBounds(p,D))return toast('你不在1号洞样板范围内，可以手动设置起点');
    if(!Number.isFinite(accuracy)||accuracy>30)return toast('定位误差较大，请到开阔处重试或手动设起点');
    state.origin=p;state.originLabel='我的位置';state.accuracy=accuracy;draw();toast('位置已更新：手机报告误差约'+Math.round(accuracy)+'米，底图误差另计');
  },()=>{if(request===locationRequest)toast('未取得定位，可在图上设起点');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
};
function info(){$('infoDialog').showModal();}$('detailsBtn').onclick=info;$('overviewBtn').onclick=()=>$('overviewDialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
photo.onload=()=>{const make=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};state.focusEnhanced=M.focusSurface(photo,D,make,true);state.focusSatellite=M.focusSurface(photo,D,make,false);draw();};photo.onerror=()=>toast('底图加载失败，请刷新重试');loadRoundContext();photo.src='satellite.jpg';new ResizeObserver(resize).observe(stage);resize();
