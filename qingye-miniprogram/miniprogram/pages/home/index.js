const B=require('../../services/backgrounds');
const Scene=require('../../services/scene');
const W=require('../../services/weather');
const Slogans=require('../../services/slogans');
const {S,run,go,tab}=require('../../services/ui');
const L=require('../../services/location'),Remote=require('../../services/remote'),C=require('../../services/catalog');
const SHARE_TITLE='青野高尔夫｜记录每一场好球';
Page({
 data:{sceneSrc:B.FALLBACK,sceneMirrored:B.FALLBACK_THEME.mirrored,nearby:[],location:{status:'idle'},stats:{},featured:{},topInset:24,weather:W.view(W.state())},
 onLoad(){this.offBackground=B.watch(s=>this.setData({sceneSrc:s.src,sceneMirrored:s.mirrored}));B.apply();this.setData({topInset:Scene.topInset()});this.offWeather=W.subscribe(s=>{this.setData({weather:W.view(s)});this.scheduleWeather(s);});this.off=L.subscribe(()=>this.refresh());this.network=e=>{if(e.isConnected&&this.shown)this.updateWeather();};if(wx.onNetworkStatusChange)wx.onNetworkStatusChange(this.network);},
 onReady(){if(L.state().status==='idle')L.request();},
 onHide(){this.shown=false;clearTimeout(this.weatherTimer);this.weatherTimer=null;},
 onUnload(){this.onHide();if(this.offWeather)this.offWeather();if(wx.offNetworkStatusChange)wx.offNetworkStatusChange(this.network);if(this.offBackground)this.offBackground();if(this.off)this.off();},
 onShow(){if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});this.shown=true;B.apply();this.setData({slogan:Slogans.get('home')});Scene.selectTab(this,0);this.refresh();this.scheduleWeather(W.state());if(L.state().status==='ready')L.request();Remote.sync().then(()=>this.refresh()).catch(()=>{});},
 onShareAppMessage(){return {title:SHARE_TITLE,path:'/pages/home/index',imageUrl:'/assets/retreat.jpg'};},
 onShareTimeline(){return {title:SHARE_TITLE,query:''};},
 updateWeather(){return W.updateCourse(this.weatherCourse);},
 scheduleWeather(s){clearTimeout(this.weatherTimer);this.weatherTimer=null;if(!this.shown)return;this.weatherTimer=setTimeout(()=>{if(this.shown)this.updateWeather();},W.refreshDelay(s));if(this.weatherTimer&&this.weatherTimer.unref)this.weatherTimer.unref();},
 refresh(){run(()=>{
  const d=S.read(),a=S.active(),loc=L.state();
  const nearby=loc.fix?L.sort(S.courses,loc.fix).filter(c=>c.distanceKm!==null&&c.operationStatus!=='closed_reported').slice(0,3).map(c=>({id:c.id,name:c.name,city:c.city,distanceText:c.distanceText})):[];
  const c=loc.fix?L.nearest(S.courses,loc.fix):null;
  const holes=c?C.sections(c).flatMap(s=>s.holes):[];
  const featured=c?{id:c.id,name:c.name,meta:[holes.length?holes.length+'洞':'',holes.length?'Par '+holes.reduce((n,h)=>n+h.par,0):'',c.city||c.province,c.distanceText].filter(Boolean).join(' · ')}:{name:loc.status==='locating'?'正在寻找附近球场…':loc.fix?'附近球场资料待补充':'开启定位，发现附近球场',meta:loc.error||(loc.fix?'可前往球场页手动选择':'点击定位，推荐离你最近的球场')};
  this.setData({profile:d.profile,active:a||null,stats:S.stats(),location:loc,nearby,featured});
  this.weatherCourse=c;if(this.shown)this.updateWeather();
 });},
 locate(){if(L.state().status==='denied')L.settings();else L.request(true);},
 start(){const a=S.active();if(a)go('score','?id='+a.id);else if(this.data.featured.id){const c=S.courses.find(c=>c.id===this.data.featured.id);go(C.canScore(c)?'create':'course',(C.canScore(c)?'?course=':'?id=')+c.id);}else tab('courses');},
 courses(){tab('courses');},
 course(e){const id=e.currentTarget.dataset.id;if(id)go('course','?id='+id);else if(!L.state().fix)this.locate();else tab('courses');},
 sceneError(){B.imageFailed();},history(){go('history');},about(){go('about');},play(){tab('courses');}
});
