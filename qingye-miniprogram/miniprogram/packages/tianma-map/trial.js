const Geo = require('./map-core');
const Raster = require('./raster-image');
const {acceptOverviewFix} = require('./location-policy');
const {draw} = require('./trial-draw');
const atlas = require('./overview-data');
const Data = require('./atlas-data');
const Camera = require('./atlas-camera');
const Hud = require('./atlas-hud');
const Viewport = require('./atlas-viewport');
const Stream = require('./atlas-stream');
const Levels = require('./atlas-levels');
const Background = require('./atlas-background');
const artCatalog = require('./atlas-art-data');
const Store = require('../../services/store');
const {holeContext} = require('./hole-context');
const atlasPhoto = require('./course-config').atlas;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const gap = (p,q) => Math.hypot(p[0]-q[0],p[1]-q[1]);
const midpoint = (a,b) => [(a[0]+b[0])/2,(a[1]+b[1])/2];

Page({
 data:{selected:1,holeNumber:1,sectionName:'老球场',par:4,mode:'overview',unit:'码',front:'—',center:'—',back:'—',pickerOpen:false,actions:[],groups:[],loading:true,error:''},
 onLoad(options={}){
   this.disposed=false;this.fixRevision=0;this.memories={};this.holes=[];this.preferArt=options.layer!=='gps';
   this.round=options.round?Store.getRound(options.round):null;
   if(this.round?.courseId!=='cn_bg_577')this.round=null;
   this.unit=this.round?.distanceUnit==='m'?'m':'yd';
   const course=Store.courses.find(c=>c.id==='cn_bg_577');
   const context=holeContext(course,this.round,options.hole);
   this.initialNumber=context.selected?.number||1;
   this.setData({mode:options.view==='overview'||(!options.hole&&!this.round&&options.view!=='focus')?'overview':'focus',unit:this.unit==='yd'?'码':'米'});
   this.fetchHoles();
 },
 async fetchHoles(){
   if(this.loadingCatalog)return;this.loadingCatalog=true;
   this.setData({error:'',loading:true});
   try{
     const {holes,source}=await Data.read();if(this.disposed)return;
     this.holes=holes;this.catalogSource=source;
     const groups=Data.sections.map((name,i)=>({name,color:holes[i*9].color,holes:holes.filter(h=>h.section===i).map(({id,sectionName,local,number,par})=>({id,sectionName,local,number,par}))}));
     this.setData({groups});this.activate(this.initialNumber,false);
     if(this.ctx)this.flyTo(this.data.mode,false);
     this.setData({loading:!this.image});
   }catch(_){if(!this.disposed)this.setData({loading:false,error:'球洞资料未能加载 · 点击重试'});}
   finally{this.loadingCatalog=false;}
 },
 onReady(){this.initCanvas();},
 onShow(){this.stream?.resume();this.refreshDetail();},
 onUnload(){this.disposed=true;this.fixRevision++;this.stopAnimation();this.cancelPaint();Background.release(this.ctx);this.stream?.close();this.stream=null;this.image=null;this.surround=null;this.loader?.close();this.artLoader?.close();},
 onHide(){this.fixRevision++;this.stopAnimation();this.cancelPaint();Background.release(this.ctx);this.stream?.pause();},
 initCanvas(){
   wx.createSelectorQuery().in(this).select('#map').fields({node:true,size:true,rect:true}).exec(rows=>{
     if(this.disposed)return;
     const box=rows?.[0];
     if(!box?.node||!box.width||!box.height){this.setData({loading:false,error:'地图未就绪 · 点击重试'});return;}
     this.canvas=box.node;this.rect=box;this.width=box.width;this.height=box.height;
     this.resizeMap(box);
     
     if(this.hole)this.flyTo(this.data.mode,false);this.syncArt();this.fetchImage();
   });
 },
 async fetchImage(){
   if(this.loadingImage||this.disposed)return;
   this.loadingImage=true;this.setData({loading:!this.image,error:''});
   this.stream?.close();
   this.stream=Stream.create({canvas:this.canvas,Raster,Geo,atlas,photo:atlasPhoto,levels:Levels,context:require('./atlas-context'),
     onChange:(image,surround)=>{
       if(this.disposed)return;this.image=image;this.surround=surround;
       if(this.data.loading)this.setData({loading:!this.hole});this.requestPaint();
     },
     onError:()=>{if(!this.disposed)this.setData({loading:false,error:'卫星图加载失败 · 点击重试'});},
     onDetailError:error=>{if(!this.disposed)this.setData({error:error?'高清底图暂未加载 · 点击重试':''});}
   });this.loader=this.stream.loader;
   try{await this.stream.start();}finally{this.loadingImage=false;}
 },
 refreshDetail(){if(this.camera&&this.image)this.stream?.refresh(this.camera,this.width,this.height,this.pixelRatio||2);},
 retry(){if(!this.hole)this.fetchHoles();if(!this.ctx)this.initCanvas();else if(!this.image)this.fetchImage();else {this.setData({error:''});this.stream?.retry();this.refreshDetail();}},
 activate(n,focus=true){
   const h=this.holes.find(h=>h.number===n);if(!h)return;
   this.fixRevision++;this.hole=h;
   const saved=this.memories[h.id];
   this.origin=(saved?.origin||this.fix||h.tee).slice();this.target=(saved?.target||h.target).slice();
   this.isFix=saved?!!saved.isFix:!!this.fix;
   const originLabel=this.isFix?'我的位置':saved?.manual?'手动起点':'参考发球点';
   this.setData({selected:h.number,holeNumber:h.local,sectionName:h.sectionName,par:h.par,originLabel,pickerOpen:false});
   this.updateDistances();
   if(focus)this.focusCurrent();
   else {this.updateHud();this.syncArt();}
 },
 updateDistances(){
   const h=this.hole,d={...atlas,greenCenter:h.green,features:[{id:'green',points:h.outline}]};
   const v=Geo.measure({origin:this.origin,target:this.target},d);
   const values={front:Geo.value(v.front,this.unit),center:Geo.value(v.center,this.unit),back:Geo.value(v.back,this.unit)};
   if(Object.keys(values).some(k=>values[k]!==this.data[k]))this.setData(values);
 },
 choose(e){this.activate(Number(e.currentTarget.dataset.n));},
 openPicker(){this.stopAnimation();this.gesture=null;this.setData({pickerOpen:true});},
 closePicker(){this.setData({pickerOpen:false});this.changeView(this.data.mode);},
 actionTap(e){this.perform(e.currentTarget.dataset.action);},
 perform(key){
   if(!this.hole)return;
   if(key==='gps'||key==='art'){this.preferArt=key==='art';this.syncArt();this.paint();return;}
   if(key==='mode')return this.data.mode==='focus'?this.showOverview():this.focusCurrent();
   if(key==='pick')return this.openPicker();
   if(key==='prev'||key==='next'){
     const n=this.hole.number+(key==='next'?1:-1);
     if(n>=1&&n<=this.holes.length)this.activate(n);return;
   }
   const act={unit:'toggleUnit',location:'locate',info:'info',zoomIn:'zoomIn',zoomOut:'zoomOut'}[key];
   if(act)this[act]();
 },
 resizeMap(box){
   this.rect=box;this.width=box.width;this.height=box.height;
   const ratio=Math.min((wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio||1,3);
   this.pixelRatio=ratio;this.canvas.width=Math.round(box.width*ratio);this.canvas.height=Math.round(box.height*ratio);
   this.ctx=this.canvas.getContext('2d');this.ctx.scale(ratio,ratio);
   this.minScale=Math.min(box.width/atlas.width,box.height/atlas.height)*.84;
   const win=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
   this.safe=Math.max(0,Math.min(38,(win.screenHeight||0)-(win.safeArea?.bottom||win.screenHeight||0)));
   this.updateHud();
 },
 updateHud(){if(this.width&&this.height)this.setData({actions:Hud.items(this.width,this.height,this.data.mode,this.safe||0,!!artCatalog[this.hole?.id])});
 },
 syncArt(){
   const src=artCatalog[this.hole?.id]?.src;
   if(this.artEntry&&this.artEntry.src!==src){this.artLoader.close();this.artEntry=null;}
   if(!src||!this.preferArt||this.data.mode!=='focus'||!this.canvas||this.artEntry)return;
   const entry={src,image:null};this.artEntry=entry;
   this.artLoader=Raster.createLoader(this.canvas);
   this.artLoader.load(src,null).then(image=>{
     if(this.disposed||entry!==this.artEntry)return;
     entry.image=image;this.paint();
   }).catch(()=>{
     if(this.disposed||entry!==this.artEntry)return;
     this.artLoader.close();this.artEntry=null;
     if(this.preferArt&&this.data.mode==='focus'){
       this.preferArt=false;wx.showToast({title:'精修图加载失败，可点选重试',icon:'none'});this.paint();
     }
   });
 },
 changeView(mode){
   this.setData({mode});this.updateHud();this.syncArt();if(!this.canvas||!this.hole)return;
   this.stopAnimation();
   const token=this.viewToken=(this.viewToken||0)+1;
   const sync=()=>wx.createSelectorQuery().in(this).select('#map').fields({node:true,size:true,rect:true}).exec(([box])=>{
     if(this.disposed||token!==this.viewToken||!box?.width||!box?.height)return;
     if(box.width!==this.width||box.height!==this.height)this.resizeMap(box);
     this.flyTo(mode);
   });
   if(wx.nextTick)wx.nextTick(sync);else setTimeout(sync,0);
 },
 onResize(){if(this.canvas)this.changeView(this.data.mode);},
 showOverview(){this.changeView('overview');},
 focusCurrent(){this.changeView('focus');},
 stopAnimation(){if(this.anim!=null){if(this.canvas?.cancelAnimationFrame)this.canvas.cancelAnimationFrame(this.anim);else clearTimeout(this.anim);}this.anim=null;},
 nextFrame(fn){return this.canvas?.requestAnimationFrame?this.canvas.requestAnimationFrame(fn):setTimeout(fn,16);},
 cancelPaint(){if(this.paintFrame!=null){if(this.canvas?.cancelAnimationFrame)this.canvas.cancelAnimationFrame(this.paintFrame);else clearTimeout(this.paintFrame);}this.paintFrame=null;},
 requestPaint(measure=false){
   this.distanceDirty=this.distanceDirty||measure;
   if(this.disposed||this.paintFrame!=null)return;
   this.paintFrame=this.nextFrame(()=>{this.paintFrame=null;if(this.distanceDirty){this.distanceDirty=false;this.updateDistances();}this.paint();});
 },
 flyTo(mode,animate=true){
   if(!this.ctx)return;
   const end=Camera.fit(this.width,this.height,this.holes,this.hole,this.origin,this.target,mode==='overview',this.safe,artCatalog[this.hole.id]?.frame);
   this.stopAnimation();
   if(!animate||!this.camera){this.camera=end;this.paint();return;}
   const start={...this.camera},time=Date.now();
   const tick=()=>{
     if(this.disposed)return;const t=Math.min(1,(Date.now()-time)/250),frac=1-Math.pow(1-t,3);
     this.camera=Camera.blend(start,end,frac,this.width,this.height);
     this.paint();if(t<1)this.anim=this.nextFrame(tick);
   };tick();
 },
 paint(){
   if(!this.ctx||!this.camera||this.disposed)return;
   this.keepMapInView();this.refreshDetail();
   const m=Geo.distance(Geo.world([0,0],this.camera,atlas),Geo.world([1,0],this.camera,atlas),atlas);
   const meters=[5,10,20,50,100,200,500,1000].reduce((best,x)=>x/m<=72?x:best,5);
   const hasArt=!!artCatalog[this.hole?.id],entry=this.data.mode==='focus'&&this.preferArt?this.artEntry:null;
   this.pins=draw(this.ctx,{width:this.width,height:this.height,pixelRatio:this.pixelRatio,atlas,image:this.image,surround:this.surround,camera:this.camera,holes:this.holes,hole:this.hole,origin:this.origin,target:this.target,isFix:this.isFix,fix:this.fix,unit:this.unit,mode:this.data.mode,safe:this.safe,measures:this.data,originLabel:this.data.originLabel,scaleText:meters+' 米',scaleWidth:meters/m,hasArt,art:entry?.image,artFrame:artCatalog[this.hole?.id]?.frame,artLoading:!!entry&&!entry.image});
 },
 toggleUnit(){this.unit=this.unit==='yd'?'m':'yd';this.setData({unit:this.unit==='yd'?'码':'米'});this.updateDistances();this.paint();},
 keepMapInView(){
   if(!this.camera)return;
   const bounds=this.surround?.bounds||require('./atlas-context')?.bounds||[0,0,atlas.width,atlas.height];
   this.camera=Viewport.constrain(this.camera,this.width,this.height,atlas,bounds);
 },
 zoomAt(factor,p){
   if(!this.camera)return;this.stopAnimation();
   Geo.zoomCamera(this.camera,factor,p,atlas,this.minScale,4);this.keepMapInView();this.paint();
 },
 zoomIn(){this.zoomAt(1.55,[this.width/2,this.height/2]);},
 zoomOut(){this.zoomAt(1/1.55,[this.width/2,this.height/2]);},
 point(t){return [Number.isFinite(t.x)?t.x:t.clientX-this.rect.left,Number.isFinite(t.y)?t.y:t.clientY-this.rect.top];},
 touchStart(e){
   if(!this.image||!this.hole||!this.camera||this.data.pickerOpen||!e.touches.length)return;this.stopAnimation();
   const [p,q]=e.touches.map(t=>this.point(t));
   if(q){this.gesture={type:'pinch',length:gap(p,q),mid:midpoint(p,q)};return;}
   const control=this.data.actions.find(a=>p[0]>=a.x&&p[0]<=a.x+a.w&&p[1]>=a.y&&p[1]<=a.y+a.h);
   if(control){this.gesture={type:'control',key:control.key,first:p};return;}
   const focus=this.data.mode==='focus',isOrigin=focus&&gap(p,Geo.screen(this.origin,this.camera,atlas))<19;
   const isTarget=focus&&gap(this.target,this.hole.green)>1&&gap(p,Geo.screen(this.target,this.camera,atlas))<19;
   this.gesture={type:isOrigin?'origin':isTarget?'target':'pan',first:p,last:p,moved:false};
   if(isOrigin)this.fixRevision++;
 },
 touchMove(e){
   const g=this.gesture;if(!g||!e.touches.length)return;const [p,q]=e.touches.map(t=>this.point(t));
   if(q&&g.type==='pinch'){
     const length=gap(p,q),mid=midpoint(p,q);if(g.length>0)Geo.zoomCamera(this.camera,length/g.length,g.mid,atlas,this.minScale,4);
     this.camera.x+=mid[0]-g.mid[0];this.camera.y+=mid[1]-g.mid[1];g.mid=mid;g.length=length;this.keepMapInView();this.requestPaint();return;
   }
   if(g.type==='control'){if(gap(p,g.first)>7)g.moved=true;return;}
   if(g.type==='pinch'||q)return;
   g.moved=g.moved||gap(p,g.first)>4;if(!g.moved)return;
   if(g.type==='pan'){
     this.camera.x+=p[0]-g.last[0];this.camera.y+=p[1]-g.last[1];this.keepMapInView();
   }else{
     const world=Geo.world(p,this.camera,atlas);
     if(Geo.inBounds(world,atlas)){
       this[g.type]=world;if(g.type==='origin'){this.isFix=false;if(this.data.originLabel!=='手动起点')this.setData({originLabel:'手动起点'});}
       this.remember();this.distanceDirty=true;
     }
   }
   g.last=p;this.requestPaint();
 },
 touchEnd(e){
   const g=this.gesture;if(!g)return;if(e.touches.length)return;this.gesture=null;
   if(g.type==='control'){if(!g.moved)this.perform(g.key);return;}
   if(g.moved||g.type!=='pan'||!e.changedTouches?.length)return;
   const p=this.point(e.changedTouches[0]),pin=this.pins?.find(mark=>Math.abs(p[0]-mark.x)<=mark.hw&&Math.abs(p[1]-mark.y)<=mark.hh);
   if(pin){this.activate(pin.n);return;}
   if(this.data.mode==='focus'){
     const dest=Geo.world(p,this.camera,atlas);if(!Geo.inBounds(dest,atlas))return;
     this.target=dest;this.remember();this.updateDistances();this.paint();
   }
 },
 touchCancel(){this.gesture=null;},
 remember(){this.memories[this.hole.id]={origin:this.origin.slice(),target:this.target.slice(),isFix:this.isFix,manual:this.data.originLabel==='手动起点'};},
 locate(){
   const rev=++this.fixRevision,valid=()=>!this.disposed&&rev===this.fixRevision;
   const fail=title=>{if(valid())wx.showToast({title,icon:'none'});};
   const get=()=>{if(!valid())return;wx.getLocation({type:'wgs84',isHighAccuracy:true,highAccuracyExpireTime:5000,
     success:r=>{if(!valid())return;const v=acceptOverviewFix(r,atlas);
       if(!v.ok)return fail(v.reason);
       this.fix=v.point;this.origin=v.point.slice();this.isFix=true;this.setData({originLabel:'我的位置 · ±'+v.accuracy+'米'});
       this.remember();this.updateDistances();if(this.data.mode==='overview')this.paint();else this.focusCurrent();
     },fail:()=>fail('可在场内用微信定位，或拖动起点')});};
   if(wx.requirePrivacyAuthorize)wx.requirePrivacyAuthorize({success:get,fail:()=>fail('可拖动起点测距')});else get();
 },
 info(){wx.showModal({title:'上海天马 · GPS 球道图',content:'老球场、天马场、新球场各 9 洞。单洞页面可切换 GPS 卫星图与精修图。精修图依据逐洞导览及卫星影像绘制，障碍物边缘为美术示意，距离按 GPS 坐标计算。场外遮罩沿卫星影像与 © OpenStreetMap contributors 的场界绘制。全场总览正北向上；本洞测距按发球区至果岭的方向旋转。洞序对照球会导览，发球区和果岭按卫星影像判读，待现场校准。旗杆标记取果岭中心作为参考位置，距离为水平估算。拖动白点设起点，点图或拖动金色十字设落点；拖到相邻球道仍测当前洞。',showCancel:false});}
});
