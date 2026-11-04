const Scene=require('../../services/scene');
const {S,run,go,tab}=require('../../services/ui');
const L=require('../../services/location'),R=require('../../services/rules'),Remote=require('../../services/remote'),C=require('../../services/catalog');
Page({
 data:{nearby:[],location:{status:'idle'},stats:{},featured:{},topInset:24},
 onLoad(){const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():{};this.setData({topInset:Scene.topInset()});this.off=L.subscribe(()=>this.refresh());},
 onReady(){if(L.state().status==='idle')L.request();},
 onUnload(){if(this.off)this.off();},
 onShow(){Scene.selectTab(this,0);this.refresh();Remote.sync().then(()=>this.refresh()).catch(()=>{});},
 refresh(){run(()=>{
  const d=S.read(),a=S.active(),loc=L.state();
  const nearby=loc.fix?L.sort(S.courses,loc.fix).filter(c=>c.distanceKm!==null&&c.operationStatus!=='closed_reported').slice(0,3).map(c=>({id:c.id,name:c.name,city:c.city,distanceText:c.distanceText})):[];
  const c=S.courses.find(c=>c.id===a?.courseId)||S.courses.find(c=>c.id===nearby[0]?.id)||S.courses.find(c=>c.id==='cn_bg_585')||S.courses.find(c=>C.canScore(c));
  const holes=c?C.sections(c).flatMap(s=>s.holes):[];
  const featured=c?{id:c.id,name:a?.courseName||c.name,meta:[holes.length+'洞','Par '+holes.reduce((n,h)=>n+h.par,0),c.city||c.province].filter(Boolean).join(' · ')}:{name:'下一场，去哪里？',meta:'发现更多值得一打的球场'};
  this.setData({profile:d.profile,active:a||null,stats:S.stats(),location:loc,nearby,featured});
 });},
 locate(){if(L.state().status==='denied')L.settings();else L.request(true);},
 start(){const a=S.active();if(a)go('score','?id='+a.id);else tab('courses');},
 courses(){tab('courses');},
 course(e){const id=e.currentTarget.dataset.id;if(id)go('course','?id='+id);else tab('courses');},
 history(){go('history');},about(){go('about');},play(){tab('courses');}
});
