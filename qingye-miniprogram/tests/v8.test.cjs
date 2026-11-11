const {test}=require('node:test'),A=require('node:assert/strict'),path=require('path'),fs=require('fs');
const root=path.resolve(__dirname,'..'),base=root+'/miniprogram',M=require(base+'/packages/hole-map/map-core'),D=require(base+'/packages/hole-map/data'),H=require(base+'/services/handicap'),R=require(base+'/services/rules');
function map(){let def;global.Page=x=>def=x;const f=base+'/packages/hole-map/index';delete require.cache[require.resolve(f)];require('./helpers/legacy-map.cjs').load(f+'.js');const p={...def,data:structuredClone(def.data),setData(x){Object.assign(this.data,x);}};p.onLoad({mode:'gps'});return p;}
test('GPS auto start requires prior location and privacy authorization; refusal keeps the selected hole usable',()=>{
 let prompts=0,fixes=0;global.wx={getSetting:o=>o.success({authSetting:{}}),requirePrivacyAuthorize:()=>prompts++,getLocation:()=>fixes++};const p=map();A.equal(fixes,0);A.equal(prompts,0);A.equal(p.data.selected,1);p.next();A.equal(p.data.selected,2);A.equal(fixes,0);
 wx.getSetting=o=>o.success({authSetting:{'scope.userLocation':true}});wx.getPrivacySetting=o=>o.success({needAuthorization:true});p.autoLocate();A.equal(fixes,0);wx.getPrivacySetting=o=>o.success({needAuthorization:false});p.autoLocate();A.equal(fixes,1);A.equal(prompts,0);
});
test('manual origin defeats delayed GPS, survives fit/reset and round-trip hole browsing',()=>{
 let fix;global.wx={getLocation:o=>fix=o,showToast:()=>{}};const p=map();p.locate();p.ctx={};p.width=390;p.height=758;p.draw=()=>{};p.fit();const a=M.screen(p.state.origin,p.state.camera,D),b=[a[0]-4,a[1]-25],evt=q=>({touches:[{x:q[0],y:q[1]}]});p.touchStart(evt(a));p.touchMove(evt(b));const manual=p.state.origin.slice();const geo=M.toGeo(D.defaultTarget,D);fix.success({latitude:geo[1],longitude:geo[0],accuracy:5});A.deepEqual(p.state.origin,manual);p.reset();A.deepEqual(p.state.origin,manual);p.next();p.previous();A.deepEqual(p.state.origin,manual);A.match(p.data.locationText,/手动/);
});
test('GPS does not accept adjacent-hole corners, invalid values or inaccurate fixes',()=>{
 const L=require(base+'/packages/hole-map/location-policy'),d=Object.values(require(base+'/packages/hole-map/satellite-holes').holes)[0],g=M.toGeo(d.defaultTarget,d),corner=M.toGeo([1,1],d);
 A.equal(L.acceptFix({longitude:g[0],latitude:g[1],accuracy:8},d).ok,true);A.equal(L.acceptFix({longitude:g[0],latitude:g[1],accuracy:35},d).ok,false);A.equal(L.acceptFix({longitude:corner[0],latitude:corner[1],accuracy:2},d).ok,false);A.equal(L.acceptFix({longitude:NaN,latitude:0,accuracy:1},d).ok,false);
});
test('image failures expose retry; stale callbacks cannot overwrite a newer load',async()=>{
 global.wx={};const p=map(),jobs=[];p.draw=()=>{};p.canvas={};p.rasterLoader={load(){return new Promise((resolve,reject)=>jobs.push({resolve,reject}));}};
 const first=p.loadImages();jobs[0].reject(new Error('network'));await first;A.match(p.data.error,/失败/);
 const retry=p.loadImages();A.equal(p.data.loading,true);const later=p.loadImages();jobs[1].resolve({width:768});await retry;A.equal(p.loaded.photo,false);A.equal(p.data.loading,true);
 jobs[2].resolve({width:768});await later;A.equal(p.data.loading,false);A.equal(p.data.error,'');p.selectHole(18);A.equal(p.data.loading,true);p.next();A.equal(p.data.selected,18);
 jobs[3].resolve({width:2048});await new Promise(r=>setImmediate(r));A.equal(p.data.loading,false);
});
test('handicap calculation uses recent 20, small-sample rules, plus indexes and separate manual override',()=>{
 A.equal(H.aggregate([15.3,15.2,16.6]).value,13.2);A.equal(H.aggregate([20,20]),null);
 A.equal(H.aggregate([0,...Array(20).fill(20)]).value,20);A.equal(H.aggregate(Array(20).fill(80)).value,54);A.equal(H.format(-2),'+2.0');
 const person={};H.setManual(person,'+2.0');A.equal(person.handicapSetting.value,-2);A.throws(()=>H.setManual(person,'99'));A.throws(()=>H.setManual(person,''));
 const data={rounds:[],friends:[],profile:person};A.equal(H.summary(data).value,-2);A.equal(H.summary(data).automatic,null);person.handicapSetting={mode:'auto'};A.equal(H.summary(data).value,null);
});
test('handicap refuses guessed ratings, incomplete and nine-hole rounds; profile has no backup actions',()=>{
 const S=require(base+'/services/store'),V=require(base+'/services/service'),c=S.courses.find(c=>c.id==='cn_bg_585'),r=V.newRound(c,[{id:'me',name:'Test',tee:'Blue'}],{id:'h-test',now:1,date:'2026-10-27'});
 for(const h of r.holes)r.scores.me[h.number]=R.normalizeScore({strokes:h.par+1,penalties:0,putts:null,fairway:null,green:null});r.status='finished_complete';
 A.equal(H.differential(r,'me'),null);r.handicapInputs={me:{tee:'Blue',confirmed:true,courseRating:72,slopeRating:113,adjustedGross:90,pcc:0}};A.equal(H.differential(r,'me'),18);
 r.handicapInputs.me.tee='White';A.equal(H.differential(r,'me'),null);r.handicapInputs.me.tee='Blue';delete r.scores.me[18];A.equal(H.differential(r,'me'),null);
 const ui=fs.readFileSync(base+'/pages/profile/index.wxml','utf8');A.doesNotMatch(ui,/备份|恢复|exportData|showImport/);
});
test('guest members have their own handicap records; local/cloud copies are deduplicated by revision',()=>{
 const S=require(base+'/services/store'),V=require(base+'/services/service'),c=S.courses.find(c=>c.id==='cn_bg_585'),r=V.newRound(c,[{id:'guest',name:'Guest',tee:'Blue'}],{id:'guest-round',now:1,date:'2026-10-27'});
 for(const h of r.holes)r.scores.guest[h.number]=R.normalizeScore({strokes:h.par+1});r.status='finished_complete';r.revision=2;
 const values={tee:'Blue',confirmed:true,courseRating:72,slopeRating:113,adjustedGross:90,pcc:0},d={rounds:[],linkedRounds:[{round:r,playerId:'guest'}],profile:{},personalHandicapInputs:{'guest-round':values}};
 A.equal(H.summary(d).validCount,1);const local=structuredClone(r);local.players[0].id='me';local.scores.me=local.scores.guest;delete local.scores.guest;local.revision=1;d.rounds=[local];A.equal(H.recordsFor(d).length,1);A.equal(H.recordsFor(d)[0].pid,'guest');
});
test('older back-nine rounds use their unambiguous section and never silently render hole 1',()=>{
 const S=require(base+'/services/store'),V=require(base+'/services/service'),c=S.courses.find(c=>c.id==='cn_bg_585'),r=V.newRound(c,[{id:'me',name:'Test',tee:'Blue'}],{id:'old',now:1,date:'2026-10-27',holes:'back'}),context=require(base+'/packages/hole-map/hole-context').holeContext;
 r.holes.forEach(h=>{h.id='old-'+h.number;delete h.sourceHoleId;});A.equal(context(c,r,1).selected.number,10);r.holes[0].sectionId='unknown';r.holes[0].label='1';A.equal(context(c,r,1).selected,undefined);A.equal(context(c,null,2).selected.number,2);
});
test('image dimensions before decode cannot cache an empty satellite cutout',async()=>{
 const original=M.focusSurface;let built=0;M.focusSurface=()=>{built++;return {};};
 try{global.wx={createOffscreenCanvas:()=>({})};const p=map();p.draw=()=>{};p.selectHole(14);p.canvas={};let done;p.rasterLoader={load:()=>new Promise(r=>done=r)};const pending=p.loadImages();
  p.prepareSurface();A.equal(built,0);A.notEqual(p.focusKey,p.mapData.id);done({width:2048});await pending;A.equal(built,1);A.equal(p.focusKey,p.mapData.id);
 }finally{M.focusSurface=original;}
});
