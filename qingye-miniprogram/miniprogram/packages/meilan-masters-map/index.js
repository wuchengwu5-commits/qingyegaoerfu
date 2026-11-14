const Dialog = require('../../services/dialog');
const Config=require('./course-config'),D=Config.defaultMap,M=require('./map-core'),S=require('../../services/store'),{roundContext}=require('./round-context'),{holeContext}=require('./hole-context'),Overview=require('./overview-core'),Diagram=require('./diagram-core'),Location=require('./location-policy');
const GpsMaps = require('./gps-maps');
const Raster=require('./raster-image');
const Hud=require('./atlas-hud');
Page({
 data:{view:'hole',mapMode:'gps',referenceAvailable:false,gpsHoleAvailable:false,gpsFallback:false,pickerOpen:false,holes:[],groups:[],selected:1,h:null,courseName:'',courseCaption:'',mapAvailable:false,diagramMode:false,gpsAvailable:false,enhancedAvailable:false,hasOverview:false,layer:'satellite',unit:'码',teeLabel:'未开局',teeColor:'#a8b19a',hasRound:false,front:'—',center:'—',back:'—',error:'',loading:true,locationText:'参考起点 · 可拖动',previousHole:null,nextHole:null,scoringHole:null},
 onLoad(o={}){
  const candidate=o.round?require('../../services/map-round').get(o.round):(typeof wx.getStorageSync==='function'?S.active():null);
  this.cid=o.course||candidate?.courseId||Config.courseId;
  const route=require('../../services/course-map-route').route(this.cid);if(route!==Config.route&&route!==Config.atlasRoute){this.redirected=true;wx.redirectTo({url:route+'?course='+encodeURIComponent(this.cid)+(o.round?'&round='+encodeURIComponent(o.round):'')+(o.hole?'&hole='+encodeURIComponent(o.hole):'')});return;}this.round=candidate?.courseId===this.cid?candidate:null;this.rid=this.round?.id||null;
  if(Config.atlasRoute&&(Config.artOverlay||!Config.references||o.mode!=='reference'&&o.layer!=='art'||o.view==='overview')){this.redirected=true;const query=Config.artOverlay?{...o,view:o.view==='overview'?'overview':'focus',layer:o.layer||(o.mode==='reference'?'art':'gps')}:o;wx.redirectTo({url:Config.atlasRoute+'?'+Object.keys(query).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(query[k])).join('&')});return;}
  const course=this.course=S.courses.find(c=>c.id===this.cid),context=holeContext(course,o.round||!o.hole?this.round:null,o.hole,Config),c=roundContext(this.round);
  this.courseMaps = Object.values(Config.holes);
  this.selectionVersion = 0;
  this.preferredMode=o.mode==='reference'?'reference':'gps';this.locationRequest=0;this.origins={};this.state={origin:D.defaultOrigin.slice(),target:D.defaultTarget.slice(),originLabel:'图上起点',transparentBackground:true,layer:'satellite',unit:c.unit};
  this.setData({overviewOnly:!!Config.overviewOnly,unit:c.unit==='m'?'米':'码',teeLabel:c.teeLabel,teeColor:c.teeColor,hasRound:c.hasRound,holes:context.holes,groups:context.groups,courseName:course?.name||'球道图',shortName:Config.shortName||(course?.name||'球道图').replace(/高尔夫(俱乐部|球场)?/g,''),scoringHole:this.round?holeContext(course,this.round,this.round.currentHole,Config).selected?.number:null,hasOverview:this.cid===Config.courseId&&!!Config.overview,availabilityNote:Config.availabilityNote,attribution:Config.attribution,assetRoot:Config.assetRoot,northLabel:Config.overview?.northUp?'N ↑':'N →',overviewAttribution:Config.overviewAttribution||Config.attribution});
  if(context.selected){this.selectHole(context.selected.number);if(Config.overviewOnly||o.view==='overview')this.overview();}else this.setData({loading:false,error:'旧球局洞号暂无法对应，请从左上角选择球洞'});
 },
 canMeasure(){return this.data.view==='hole'&&this.data.gpsAvailable;},
 canLocate(){return this.canMeasure()||this.data.view==='overview'&&!!Config.overview?.extent;},
 canInteract(){return this.data.view==='overview'||this.data.mapAvailable;},
 selectHole(n,mode){
  const h=this.data.holes.find(h=>h.number===Number(n));if(!h)return;
  const selectionVersion = ++this.selectionVersion;
  this.saveOrigin();this.locationRequest++;this.imageRequest=(this.imageRequest||0)+1;this.diagramRequest=(this.diagramRequest||0)+1;clearTimeout(this.gpsTimer);this.gesture=null;
  if(mode==='reference'||mode==='gps')this.preferredMode=mode;
  const gps=(this.databaseHoles || Config.holes)[h.sourceId]||null,reference=Config.references?.[h.sourceId],useReference=!!reference&&this.preferredMode!=='gps';
  const needsDatabase = Config.databaseGps && !useReference && !gps;
  this.mapData=useReference?reference:gps;const d=this.mapData||D,at=this.data.holes.indexOf(h),available=!!this.mapData;
  this.focusKey=null;this.state.focusEnhanced=null;this.state.focusSatellite=null;this.state.layer='satellite';this.diagramPhoto=null;this.diagramId=null;
  this.setData({selected:h.number,h,previousHole:this.data.holes[at-1]?.number||null,nextHole:this.data.holes[at+1]?.number||null,referenceAvailable:!!reference,gpsHoleAvailable:!!Config.databaseGps||!!gps&&!gps.diagram,mapMode:useReference?'reference':'gps',waitingForGps:!!needsDatabase,cachedGps:!useReference&&this.gpsCatalogSource==='cache',gpsFallback:!!reference&&!gps&&!useReference&&!needsDatabase,diagramMode:available&&!!d.diagram,gpsAvailable:available&&!d.diagram,loading:available||!!needsDatabase,locationText:'参考起点 · 可拖动',view:'hole',pickerOpen:false,mapAvailable:available,enhancedAvailable:false,layer:this.state.layer,error:'',front:'—',center:'—',back:'—',courseCaption:Config.sectionNames?this.data.shortName:this.data.shortName+' · '+(this.data.groups.length===2?(h.groupIndex===0?'前九':'后九'):h.sectionName)+' '+h.label});
  const player=this.round?.players.find(p=>p.id===this.round.currentPlayer)||this.round?.players[0],tee=this.course?.teeData?.find(t=>t.name===player?.tee)||this.course?.teeData?.[0],yards=tee?.distances?.[h.sourceId];this.setData({cardDistance:Number.isFinite(yards)?Math.round(yards):'—',cardTee:tee?.name||'未指定 Tee',pendingSatellite:!!Config.pendingSatellite});
  const remembered=d.diagram?null:this.origins[h.sourceId];this.state.origin=remembered?.point.slice()||d.defaultOrigin.slice();this.state.target=d.defaultTarget.slice();this.state.accuracy=null;this.manualOrigin=!!remembered;this.state.originLabel=remembered?'手动起点':'参考起点';if(remembered)this.setData({locationText:'手动起点 · 可拖动'});
  if (needsDatabase) {
    this.draw();
    return this.openDatabaseHole(h, selectionVersion);
  }
  if(this.data.gpsFallback&&this.data.hasOverview){this.overview();return;}
  if(d.diagram)this.loadDiagram();else this.loadImages();this.prepareSurface();this.fit();if(!available)this.setData({loading:false});this.autoLocate();
 },
 async openDatabaseHole(hole, selectionVersion) {
  if (!this.catalogRequest) {
    const ids = this.data.holes.map(item => item.sourceId);
    this.catalogRequest = GpsMaps.read(this.cid, ids).finally(() => { this.catalogRequest = null; });
  }
  try {
    const catalog = await this.catalogRequest;
    if (this.destroyed || selectionVersion !== this.selectionVersion) return;
    this.databaseHoles = catalog.maps;
    this.courseMaps = Object.values(catalog.maps);
    this.gpsCatalogSource = catalog.source;
    this.selectHole(hole.number, 'gps');
  } catch (_) {
    if (this.destroyed || selectionVersion !== this.selectionVersion) return;
    this.setData({loading:false, error:'本洞 GPS 资料读取失败'});
  }
 },
 saveOrigin(){if(this.manualOrigin&&this.mapData&&!this.mapData.diagram)this.origins[this.mapData.id]={point:this.state.origin.slice()};},
 switchMapMode(){if(Config.atlasRoute&&this.data.mapMode==='reference'){wx.navigateTo({url:Config.atlasRoute+'?source='+encodeURIComponent(this.data.h.sourceId)+'&view=focus'+(this.rid?'&round='+encodeURIComponent(this.rid):'')});return;}if(this.data.referenceAvailable)this.selectHole(this.data.selected,this.data.mapMode==='reference'?'gps':'reference');},
 hudOptions(){return {showMeasures:this.canMeasure(),canLocate:this.canLocate(),canInteract:this.canInteract(),hasOverview:this.data.hasOverview&&!Config.overviewOnly};},
 updateHud(){
  if(!this.width||!this.height)return;
  const actions=Hud.items(this.width,this.height,this.data.view==='overview'?'overview':'focus',this.safe||0,this.data.referenceAvailable,false,this.hudOptions()).map(a=>({...a,disabled:a.key==='prev'?!this.data.previousHole:a.key==='next'?!this.data.nextHole:false}));
  const key=JSON.stringify(actions);if(key!==this.hudKey){this.hudKey=key;this.setData({actions});}
 },
 actionTap(e){this.perform(e.currentTarget.dataset.action);},
 perform(key){
  if(key==='pick')return this.openPicker();
  if(key==='mode')return this.data.view==='overview'?this.selectHole(this.data.selected,'gps'):this.overview();
  if(key==='gps'||key==='art'){const mode=key==='gps'?'gps':'reference';if(mode!==this.data.mapMode)return this.switchMapMode();return;}
  if(key==='prev')return this.previous();if(key==='next')return this.next();
  if(key==='location')return this.locate();if(key==='info')return this.info();
  if(key==='unit'){this.state.unit=this.state.unit==='yd'?'m':'yd';this.setData({unit:this.state.unit==='yd'?'码':'米'});return this.draw();}
  if(key==='zoomIn'||key==='zoomOut')return this.zoomAt(key==='zoomIn'?1.35:1/1.35,[this.width/2,this.height/2]);
 },
 drawHud(){
  this.updateHud();
  const h=this.data.h||{par:'—',displayTitle:'选择球洞'},mode=this.data.view==='overview'?'overview':'focus',d=mode==='overview'?Config.overview:this.mapData;
  let scaleWidth=0,scaleText='';
  if(d?.extent&&this.state.camera?.scale&&!d.diagram){const p=[d.width/2,d.height/2],mpp=M.distance(p,[p[0]+1,p[1]],d)/this.state.camera.scale;if(mpp>0){const raw=mpp*64,power=10**Math.floor(Math.log10(raw)),meters=[1,2,5,10].map(n=>n*power).filter(n=>n<=raw).pop()||power;scaleWidth=meters/mpp;scaleText=meters+' 米';}}
  Hud.draw(this.ctx,{width:this.width,height:this.height,safe:this.safe||0,mode,controls:this.hudOptions(),hole:{par:h.par},holes:this.data.holes,pickText:mode==='overview'?(Config.overviewOnly?'卫星全览 · 待标注':'全场 '+this.data.holes.length+' 洞 ﹀'):h.displayTitle+' ﹀',holeCountText:this.data.selected+' / '+this.data.holes.length,previousAvailable:!!this.data.previousHole,nextAvailable:!!this.data.nextHole,hasArt:this.data.referenceAvailable,art:this.data.mapMode==='reference',artLabel:'精修图',measures:{center:this.data.center,front:this.data.front,back:this.data.back},unit:this.state.unit,camera:this.state.camera||{},showCompass:!this.data.diagramMode&&this.canInteract(),showLegend:false,footText:this.data.diagramMode?'精修图 · 不用于 GPS 测距 ⓘ':'Esri · Vantor · GIS'+(/OpenStreetMap/.test(Config.attribution||'')?' · © OSM':'')+' ⓘ',scaleText,scaleWidth});
 },
 previous(){if(this.data.previousHole)this.selectHole(this.data.previousHole);},
 next(){if(this.data.nextHole)this.selectHole(this.data.nextHole);},
 currentHole(){if(this.data.scoringHole)this.selectHole(this.data.scoringHole);},
 chooseHole(e){this.selectHole(e.currentTarget.dataset.number);},
 openPicker(){this.gesture=null;this.setData({pickerOpen:true});},
 closePicker(){this.setData({pickerOpen:false});},
 keepPicker(){},
 prepareSurface(){
  const d=this.mapData,image=d?.satelliteOnly?this.overviewPhoto:this.photo;
  if(this.data.view!=='hole'||!d||d.diagram||!this.loaded?.[d.satelliteOnly?'atlas':'photo']||!image?.width||this.focusKey===d.id)return;
  if(wx.createOffscreenCanvas){try{const make=(width,height)=>wx.createOffscreenCanvas({type:'2d',width,height});this.state.focusSatellite=M.focusSurface(image,d,make,false);if(!d.satelliteOnly)this.state.focusEnhanced=M.focusSurface(image,d,make,true);}catch(e){this.state.focusSatellite=null;this.state.focusEnhanced=null;}}
  this.focusKey=d.id;
 },
 onReady(){if(!this.redirected)this.initCanvas();},
 initCanvas(attempt=0){
  if(this.destroyed)return;
  wx.createSelectorQuery().in(this).select('#map').fields({node:true,size:true,rect:true}).exec(res=>{
   if(this.destroyed)return;const box=res[0];
   if(!box?.node||!box.width||!box.height){if(attempt<3){this.canvasRetry=setTimeout(()=>this.initCanvas(attempt+1),120);return;}this.setData({loading:false,error:'地图暂未就绪，点击重试'});return;}
   this.rect=box;this.canvas=box.node;this.ctx=this.canvas.getContext('2d');this.width=box.width;this.height=box.height;
   const windowInfo=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync(),ratio=Math.min(3,windowInfo.pixelRatio||1);this.safe=Math.max(0,(windowInfo.screenHeight||0)-(windowInfo.safeArea?.bottom||windowInfo.screenHeight||0));this.canvas.width=box.width*ratio;this.canvas.height=box.height*ratio;this.ctx.scale(ratio,ratio);
   this.loadImages();this.loadDiagram();this.fit();
  });
 },
 loadImages(){
  if(!this.canvas||this.destroyed)return;this.loaded=this.loaded||{};
  const revision=this.imageRequest=(this.imageRequest||0)+1,isOverview=this.data.view==='overview',d=this.mapData;
  if(!isOverview&&(!d||d.diagram))return;
  const key=isOverview||d.satelliteOnly?'atlas':'photo',src=!isOverview&&d.satelliteImage?d.satelliteImage:(key==='atlas'?Config.atlas:Config.photo),prop=key==='atlas'?'overviewPhoto':'photo';
  if(!src)return;this.rasterLoader=this.rasterLoader||Raster.createLoader(this.canvas);
  const region=isOverview?null:d.sourceWindow||{x:0,y:0,width:d.width,height:d.height};
  this.loaded[key]=false;this[prop]=null;this.focusKey=null;this.state.focusSatellite=null;this.state.focusEnhanced=null;
  this.setData({loading:true,error:''});
  return this.rasterLoader.load(src,region).then(image=>{
   if(this.destroyed||revision!==this.imageRequest)return;
   this[prop]=image;this.loaded[key]=true;if(key==='atlas')this.atlasFailed=false;else this.photoFailed=false;
   this.setData({loading:false,error:''});this.prepareSurface();this.draw();
  }).catch(()=>{
   if(this.destroyed||revision!==this.imageRequest)return;
   if(key==='atlas')this.atlasFailed=true;else this.photoFailed=true;
   this.setData({loading:false,error:'卫星图加载失败，点击重试'});
  });
 },
 loadDiagram(){
  if(!this.canvas||this.data.view!=='hole'||!this.mapData?.diagram)return;
  const d=this.mapData,request=this.diagramRequest=(this.diagramRequest||0)+1,img=this.canvas.createImage();this.diagramPhoto=null;this.diagramId=null;
  img.onload=()=>{if(this.destroyed||request!==this.diagramRequest||this.mapData?.id!==d.id)return;this.diagramPhoto=img;this.diagramId=d.id;if(this.data.view==='hole')this.setData({loading:false,error:''});this.draw();};
  img.onerror=()=>{if(this.destroyed||request!==this.diagramRequest||this.mapData?.id!==d.id)return;require('../../services/media').forget(d.image);if(this.data.view==='hole')this.setData({loading:false,error:'精修图加载失败，点击重试'});};
  require('../../services/media').local(d.image).then(src=>{if(!this.destroyed&&request===this.diagramRequest)img.src=src;},()=>img.onerror());
 },
 retry(){this.setData({error:'',loading:true});if(this.data.waitingForGps&&this.data.view==='hole'){this.selectHole(this.data.selected,'gps');if(!this.canvas)this.initCanvas();return;}if(!this.canvas)this.initCanvas();else if(this.data.view==='hole'&&this.mapData?.diagram)this.loadDiagram();else this.loadImages();},
 onUnload(){clearTimeout(this.gpsTimer);this.overviewFix=null;this.locationRequest++;this.destroyed=true;this.rasterLoader?.close();clearTimeout(this.canvasRetry);},
 onHide(){this.hidden=true;clearTimeout(this.gpsTimer);this.locationRequest++;},
 onShow(){this.hidden=false;if(this.state)this.autoLocate();},
 scheduleGps(){clearTimeout(this.gpsTimer);if(this.hidden||this.destroyed)return;this.gpsTimer=setTimeout(()=>this.autoLocate(),5000);this.gpsTimer.unref?.();},
 draw(){if(!this.ctx||this.destroyed)return;if(this.data.view==='overview'){Overview.draw(this.ctx,this.overviewPhoto,this.width,this.height,this.state.camera,Config.overview);if(this.overviewFix){const q=M.screen(this.overviewFix.point,this.state.camera,Config.overview);this.ctx.save();this.ctx.beginPath();this.ctx.arc(q[0],q[1],8,0,Math.PI*2);this.ctx.fillStyle='#2387ed';this.ctx.fill();this.ctx.lineWidth=3;this.ctx.strokeStyle='#fff';this.ctx.stroke();this.ctx.restore();}}else if(this.data.diagramMode){Diagram.draw(this.ctx,this.diagramId===this.mapData?.id?this.diagramPhoto:null,this.width,this.height,this.state.camera,this.mapData);}else if(!this.data.mapAvailable){this.ctx.clearRect(0,0,this.width,this.height);}else{const d=this.mapData,image=d.satelliteOnly?this.overviewPhoto:this.photo;M.draw(this.ctx,this.loaded?.[d.satelliteOnly?'atlas':'photo']&&image?.width?image:null,this.width,this.height,this.state,d);const v=M.measure(this.state,d),next={front:M.value(v.front,this.state.unit),center:M.value(v.center,this.state.unit),back:M.value(v.back,this.state.unit)};if(Object.keys(next).some(k=>next[k]!==this.data[k]))this.setData(next);}this.drawHud();},
 fit(){if(!this.ctx)return;if(this.data.view==='hole'&&!this.data.mapAvailable){this.draw();return;}this.state.camera=this.data.view==='overview'?Overview.fit(this.width,this.height,Config.overview):this.mapData?.diagram?Diagram.fit(this.width,this.height,this.mapData):M.focusFit(this.width,this.height,this.mapData||D,this.courseMaps);this.baseScale=this.state.camera.scale;this.draw();},
 toggleLayer(){if(!this.canMeasure()||!this.data.enhancedAvailable)return;this.state.layer=this.state.layer==='enhanced'?'satellite':'enhanced';this.setData({layer:this.state.layer});this.draw();},
 zoomAt(f,p){if(!this.ctx||!this.canInteract())return;this.manualCamera=true;const min=this.data.view==='overview'&&Config.overview?.northUp?Overview.fit(this.width,this.height,{...Config.overview,fillViewport:false}).scale:this.baseScale;M.zoomCamera(this.state.camera,f,p,this.data.view==='overview'?Config.overview:this.mapData,min,this.baseScale*(Config.overview?.maxZoom||5));this.draw();},
 local(t){return [Number.isFinite(t.x)?t.x:t.clientX-this.rect.left,Number.isFinite(t.y)?t.y:t.clientY-this.rect.top];},
 touchStart(e){if(!this.ctx||this.data.pickerOpen||!e.touches.length||!this.canInteract())return;const ts=e.touches.map(t=>this.local(t));if(ts.length===2){this.gesture={pinch:true,length:Math.hypot(ts[0][0]-ts[1][0],ts[0][1]-ts[1][1]),moved:true};return;}const p=ts[0],origin=this.canMeasure()?M.screen(this.state.origin,this.state.camera,this.mapData):[-999,-999],target=this.canMeasure()?M.screen(this.state.target,this.state.camera,this.mapData):[-999,-999],od=Math.hypot(p[0]-origin[0],p[1]-origin[1]),td=Math.hypot(p[0]-target[0],p[1]-target[1]),handle=this.canMeasure()?(od<24&&od<td?'origin':td<24?'target':'pan'):'pan';if(handle==='origin')this.locationRequest++;this.gesture={start:p,last:p,moved:false,handle};},
 touchMove(e){if(!this.gesture||!this.ctx||!e.touches.length)return;const ts=e.touches.map(t=>this.local(t)),g=this.gesture;if(ts.length===2){const length=Math.hypot(ts[0][0]-ts[1][0],ts[0][1]-ts[1][1]);if(g.length>0)this.zoomAt(length/g.length,[(ts[0][0]+ts[1][0])/2,(ts[0][1]+ts[1][1])/2]);g.length=length;g.pinch=true;g.moved=true;return;}if(g.pinch)return;const p=ts[0];if(Math.hypot(p[0]-g.start[0],p[1]-g.start[1])>5)g.moved=true;if(!g.moved)return;if(g.handle==='target'||g.handle==='origin'){const q=M.world(p,this.state.camera,this.mapData||D);if(M.inBounds(q,this.mapData)){this.state[g.handle]=q;if(g.handle==='origin'){this.locationRequest++;this.manualOrigin=true;this.state.accuracy=null;this.state.originLabel='手动起点';this.saveOrigin();this.setData({locationText:'手动起点 · 可拖动'});}}}else{this.manualCamera=true;this.state.camera.x+=p[0]-g.last[0];this.state.camera.y+=p[1]-g.last[1];}g.last=p;this.draw();},
 touchEnd(e){if(!this.gesture||!this.ctx)return;if(e.touches.length)return;const g=this.gesture;this.gesture=null;if(g.moved||g.pinch||g.handle!=='pan'||!e.changedTouches.length||!this.canMeasure())return;const q=M.world(this.local(e.changedTouches[0]),this.state.camera,this.mapData||D);if(M.inBounds(q,this.mapData)){this.state.target=q;this.draw();}},
 touchCancel(){this.gesture=null;},
 reset(){this.manualCamera=false;this.locationRequest++;const d=this.mapData||D;this.state.target=d.defaultTarget.slice();this.fit();},
 autoLocate(){
  if(!this.canLocate()||this.applyingFix||this.manualOrigin||this.hidden||!wx.getSetting)return;
  const request=this.locationRequest;
  wx.getSetting({success:r=>{if(this.destroyed||request!==this.locationRequest||this.manualOrigin||r.authSetting?.['scope.userLocation']!==true)return;
   if(wx.getPrivacySetting)wx.getPrivacySetting({success:p=>{if(!p.needAuthorization&&request===this.locationRequest)this.locate(true);}});else this.locate(true);
  }});
 },
 locate(auto=false){
  if(!this.canLocate())return;auto=auto===true;if(!auto)this.manualCamera=false;
  const request=++this.locationRequest,valid=()=>!this.destroyed&&request===this.locationRequest;
  const failed=text=>{if(!valid())return;if(this.data.view==='overview'){this.overviewFix=null;this.draw();}if(this.trackingGps)this.scheduleGps();this.setData({locationText:this.manualOrigin?'手动起点 · 可拖动':text});if(!auto)wx.showToast({title:text,icon:'none'});};
  const run=()=>{if(!valid())return;wx.getLocation({type:'wgs84',isHighAccuracy:true,highAccuracyExpireTime:5000,success:r=>{
   if(!valid())return;if(this.data.view==='overview'){const result=Location.acceptOverviewFix(r,Config.overview);if(!result.ok)return failed(result.reason);this.trackingGps=true;this.overviewFix=result;if(this.ctx&&!this.manualCamera){const q=M.screen(result.point,this.state.camera,Config.overview);this.state.camera.x+=this.width/2-q[0];this.state.camera.y+=this.height/2-q[1];}this.setData({locationText:'我的位置 · 约 ±'+result.accuracy+' 米'});this.draw();this.scheduleGps();return;}let result=Location.acceptFix(r,this.mapData);if(!result.ok&&auto&&!this.manualOrigin){const match=Location.resolveHole(r,this.courseMaps);if(match){this.applyingFix=true;this.selectHole(match.hole.number||this.data.holes.find(h=>h.sourceId===match.hole.id)?.number,'gps');this.applyingFix=false;result=match.fix;}}if(!result.ok)return failed(result.reason);
   this.trackingGps=true;this.state.origin=result.point;this.state.originLabel='我的位置';this.state.accuracy=result.accuracy;this.manualOrigin=false;delete this.origins[this.mapData.id];
   this.setData({locationText:'GPS 起点 · 约 ±'+result.accuracy+' 米'});this.draw();this.scheduleGps();
  },fail:()=>failed('未取得定位，可拖动起点')});};
  if(!auto&&wx.requirePrivacyAuthorize)wx.requirePrivacyAuthorize({success:run,fail:()=>failed('未授权定位，可拖动起点')});else run();
 },
 wholeCourse(){this.manualCamera=true;if(!this.ctx||!Config.overview)return;this.state.camera=Overview.fit(this.width,this.height,{...Config.overview,fillViewport:false});this.draw();},
 overview(){if(!this.data.hasOverview)return;if(Config.atlasRoute){wx.navigateTo({url:Config.atlasRoute+'?view=overview&source='+encodeURIComponent(this.data.h.sourceId)+(this.rid?'&round='+encodeURIComponent(this.rid):'')});return;}this.selectionVersion++;this.locationRequest++;this.diagramRequest=(this.diagramRequest||0)+1;clearTimeout(this.gpsTimer);this.gesture=null;this.preferredMode='gps';this.setData({view:'overview',waitingForGps:false,mapMode:'gps',diagramMode:false,gpsAvailable:false,pickerOpen:false,loading:true,error:'',locationText:this.overviewFix?'我的位置 · 约 ±'+this.overviewFix.accuracy+' 米':'点击定位显示我的位置'});this.loadImages();this.fit();this.autoLocate();},
 info(){const reference=this.data.view==='hole'&&this.data.mapMode==='reference';Dialog.modal({title:reference?'精修图':this.data.view==='overview'?'全场卫星总览':'球道地图说明',content:reference?Config.referenceNote:this.data.view==='overview'?Config.overviewNote:Config.mapNote,showCancel:false});}
});
