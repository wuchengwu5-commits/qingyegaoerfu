const {test,beforeEach,afterEach}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const base=path.resolve(__dirname,'../miniprogram'),Store=require(base+'/services/store'),Account=require(base+'/services/account'),V=require(base+'/services/service'),Catalog=require(base+'/services/catalog'),MapRound=require(base+'/services/map-round'),Routes=require(base+'/services/course-map-route'),Score=require(base+'/services/score-page');
let memory,urls,user,originalUser;
beforeEach(()=>{memory={};urls=[];user={uid:'teammate'};originalUser=Account.user;Account.user=()=>user;global.wx={getStorageSync:k=>memory[k],setStorageSync:(k,v)=>memory[k]=structuredClone(v),navigateTo:o=>urls.push(o),redirectTo:o=>urls.push(o),showToast(){}};MapRound.prepare(null);});
afterEach(()=>{MapRound.prepare(null);Account.user=originalUser;});
function round(courseId='cn_bg_585'){
 const c=Store.courses.find(c=>c.id===courseId),ids=Catalog.sections(c).slice(0,2).reverse().map(s=>s.id);
 const r=V.newRound(c,[{id:'me',name:'Private owner',tee:'Blue',accountUid:'owner'},{id:'friend',name:'Private teammate',tee:'Red',accountUid:'teammate'}],{id:'remote-'+courseId,segmentIds:ids,now:1,date:'2026-11-14'});
 r.currentPlayer='friend';r.currentHole=2;r.distanceUnit='m';return r;
}
function open(r,remote=true){
 const p={...Score,rid:r.id,remoteRef:remote?{activityId:'activity',groupId:'group'}:null,remoteRound:remote?r:null,data:{r,h:r.holes.find(h=>h.number===r.currentHole)}};
 if(!remote)p.viewedRound=()=>r;
 p.guide();return p;
}
function map(url){
 const u=new URL(url,'https://local.invalid'),file=base+u.pathname+'.js',native=createRequire(file);let def;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:p=>def=p,require:native,wx:global.wx,setTimeout,clearTimeout,console});
 const p={...def,data:structuredClone(def.data),setData:v=>Object.assign(p.data,v),fetchHoles(){},paint(){}};
 p.onLoad(Object.fromEntries(u.searchParams));return p;
}
test('the shared scoring template exposes map browsing to both owner and remote participants',()=>{
 const wxml=fs.readFileSync(base+'/pages/score/index.wxml','utf8'),tag=wxml.match(/<text\b[^>]*class="link course-map-link"[^>]*>/)?.[0];
 A.ok(tag);A.doesNotMatch(tag,/wx:if/);A.match(tag,/bindtap="guide"/);
 A.match(fs.readFileSync(base+'/components/live-score/index.wxml','utf8'),/pages\/score\/index.wxml/);
});
test('remote map entry preserves the physical back-nine hole and unit without storing a scorecard',()=>{
 const r=round(),before=JSON.stringify(r);A.equal(Store.getRound(r.id),undefined);const disk=JSON.stringify(memory);
 const p=open(r);A.equal(urls.length,1);A.equal(p.openingCourseMap,true);
 const target=map(urls[0].url);A.equal(target.initialNumber,11);A.equal(target.unit,'m');A.equal(target.preferArt,false);
 A.equal(target.round.currentPlayer,'friend');A.equal(target.round.players[1].tee,'Red');
 A.equal(target.round.scores,undefined);A.equal(target.round.players[1].name,undefined);A.equal(target.round.players[1].accountUid,undefined);
 A.equal(JSON.stringify(r),before);A.equal(JSON.stringify(memory),disk);A.equal(Store.getRound(r.id),undefined);
 p.guide();A.equal(urls.length,1);
});
test('local and invited views use the same hole after route changes, including Tianma and legacy redirects',()=>{
 for(const id of ['cn_bg_585','cn_bg_2525','cn_bg_577','cn_bg_571','cn_bg_611']){
  const r=round(id);open(r,false);let target=map(urls.at(-1).url);if(target.redirected)target=map(urls.at(-1).url);
  const initial=target.initialNumber;A.ok(initial>9,id);A.equal(target.unit,'m');
  open(r,true);target=map(urls.at(-1).url);if(target.redirected)target=map(urls.at(-1).url);
  A.equal(target.initialNumber,initial,id);A.equal(target.preferArt,false,id);A.equal(target.round.currentPlayer,'friend');
 }
});
test('map context survives subpage reads, is detached from scoring, and is replaced on the next visit',()=>{
 const r=round();open(r);const snapshot=MapRound.get(r.id);snapshot.holes[0].id='changed';snapshot.players[1].tee='Black';
 A.notEqual(MapRound.get(r.id).holes[0].id,'changed');A.equal(MapRound.get(r.id).players[1].tee,'Red');
 r.currentPlayer='me';r.currentHole=5;open(r);A.equal(MapRound.get(r.id).currentPlayer,'me');A.equal(MapRound.get(r.id).currentHole,5);
 const other=round('cn_bg_577');open(other);A.equal(MapRound.get(r.id),undefined);A.equal(MapRound.get(other.id).courseId,'cn_bg_577');
 Routes.openFromPage({},'cn_bg_585');A.equal(MapRound.get(other.id),undefined);
});
test('navigation failure can retry and account changes cannot reuse another participant’s context',()=>{
 const r=round(),p=open(r);urls[0].fail();A.equal(p.openingCourseMap,false);A.equal(MapRound.get(r.id),undefined);
 p.guide();A.equal(urls.length,2);A.equal(MapRound.get(r.id).id,r.id);
 user={uid:'another'};A.equal(MapRound.get(r.id),undefined);user={uid:'teammate'};A.equal(MapRound.get(r.id),undefined);
});
