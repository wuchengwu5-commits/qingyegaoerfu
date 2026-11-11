const {test}=require('node:test'),A=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram'),routes=require(base+'/services/course-map-route');
function page(pkg,name,o={}){let def;global.Page=p=>def=p;const f=base+'/packages/'+pkg+'/'+name;delete require.cache[require.resolve(f)];require(f);const p={...def,data:structuredClone(def.data),setData(v){Object.assign(this.data,v)}};p.onLoad(o);return p;}
const completed=[['hole-map','cn_bg_585'],['links-map','cn_bg_567'],['huakai-map','cn_bg_565']];
test('completed course maps open continuous GPS directly from details and score, with 18 fixed source IDs',async()=>{
 for(const [pkg,cid] of completed){global.wx={};A.equal(routes.route(cid),'/packages/'+pkg+'/atlas');A.equal(routes.gpsCount(cid),18);const p=page(pkg,'atlas',{hole:10});await new Promise(r=>setImmediate(r));A.equal(p.holes.length,18);A.equal(p.hole.id,cid+'_s2_h01');A.equal(p.data.mode,'focus');
 for(let n=1;n<=18;n++){p.activate(n);A.equal(p.hole.number,n);A.ok(Number(p.data.center)>0);}
 p.showOverview();A.equal(p.data.mode,'overview');p.onUnload();}
});
test('Yintao keeps art and GPS on one physical-hole atlas and redirects legacy reference bookmarks',async()=>{
 let url;global.wx={redirectTo:o=>url=o.url};const p=page('hole-map','atlas',{hole:12});await new Promise(r=>setImmediate(r));A.equal(p.preferArt,true);const hole=p.hole,origin=p.origin.slice(),target=p.target.slice(),center=p.data.center;p.perform('gps');A.equal(p.preferArt,false);p.perform('reference');A.equal(p.preferArt,true);A.equal(url,undefined);A.equal(p.hole,hole);A.deepEqual(p.origin,origin);A.deepEqual(p.target,target);A.equal(p.data.center,center);p.onUnload();
 const ref=page('hole-map','index',{course:'cn_bg_585',hole:12,mode:'reference'});A.equal(ref.redirected,true);A.match(url,/hole-map\/atlas/);A.match(url,/hole=12/);A.match(url,/layer=art/);A.match(url,/view=focus/);
 page('hole-map','index',{course:'cn_bg_585',hole:12,mode:'gps'});A.match(url,/layer=gps/);
});
test('both Meilan courses now expose 18 real atlas holes from the directory and preserve fixed IDs',async()=>{
 for(const [pkg,cid] of [['meilan-masters-map','cn_bg_569'],['meilan-nicklaus-map','cn_bg_9127']]){global.wx={};A.equal(routes.route(cid),'/packages/'+pkg+'/atlas');A.equal(routes.gpsCount(cid),18);const p=page(pkg,'atlas',{hole:10});await new Promise(r=>setImmediate(r));A.equal(p.holes.length,18);A.equal(p.hole.id,cid+'_s2_h01');A.equal(p.data.mode,'focus');A.ok(+p.data.center>0);p.showOverview();A.equal(p.data.mode,'overview');p.onUnload();}
});
