const {test}=require('node:test'),A=require('node:assert/strict');
const root='../miniprogram/services/',catalog=require(root+'backgrounds-data');
test('native permission descriptions stay within the verified 30-character upload limit',()=>{
 const app=require('../miniprogram/app.json');for(const [key,p] of Object.entries(app.permission||{}))A.ok([...p.desc].length<=30,key);
});
function setup(t){
 const previous=global.wx,data=new Map(),files=new Set(),requests=[];
 global.wx={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>data.get(k),setStorageSync:(k,v)=>data.set(k,structuredClone(v)),getFileSystemManager:()=>({accessSync(p){if(!files.has(p))throw Error('missing');},mkdirSync(){},copyFile(o){files.add(o.destPath);o.success();},unlinkSync(p){files.delete(p);}}),cloud:{init(){},downloadFile(o){requests.push(o);}}};
 for(const f of ['backgrounds','media'])delete require.cache[require.resolve(root+f)];
 const B=require(root+'backgrounds');t.after(()=>{B.pause();global.wx=previous;for(const f of ['backgrounds','media'])delete require.cache[require.resolve(root+f)];});
 const done=(index=0)=>requests[index].success({tempFilePath:'/temp/'+index+'.jpg'});
 return {B,data,files,requests,done};
}
test('retired original is absent and existing manual preference migrates to local spring without downloading',async t=>{
 const {B,data,requests}=setup(t);data.set('qingye.background.settings.v1',{mode:'manual',themeId:'original'});
 A.equal(B.items().length,8);A.ok(B.items().every(x=>x.id!=='original'));
 A.deepEqual(B.preferences(),{mode:'manual',themeId:catalog[0].id});A.equal(data.get('qingye.background.settings.v1').themeId,catalog[0].id);
 await B.apply();A.equal(requests.length,0);A.equal(B.display().src,'/assets/spring-morning.jpg');
 A.throws(()=>B.save({mode:'manual',themeId:'original'}),/请选择/);
});
test('automatic selection follows local seasons and exact dawn/sunset boundaries; rain and snow remain manual',t=>{
 const {B}=setup(t),list=B.items(),pick=(month,hour)=>B.selectTheme(list,{mode:'auto'},new Date(2026,month-1,15,hour)).theme.id;
 A.equal(pick(4,12),'01-spring-morning');A.equal(pick(7,12),'02-summer-noon');A.equal(pick(10,12),'03-autumn-afternoon');A.equal(pick(1,12),'04-winter-sun');
 A.equal(pick(4,5),'05-misty-dawn');A.equal(pick(4,8),'01-spring-morning');A.equal(pick(1,6),'04-winter-sun');A.equal(pick(10,16),'06-lakeside-sunset');A.equal(pick(10,19),'03-autumn-afternoon');
 for(let month=1;month<=12;month++)for(let hour=0;hour<24;hour++)A.ok(!['07-gentle-rain','08-light-snow'].includes(pick(month,hour)));
});
test('manual choices persist across restart, never depend on season, and spring remains available offline',async t=>{
 const {B,data,requests,done}=setup(t),pending=B.save({mode:'manual',themeId:'08-light-snow'});A.equal(requests.length,1);done();await pending;
 A.equal(B.display().id,'08-light-snow');A.equal(B.selectTheme(B.items(),B.preferences(),new Date(2026,6,1,12)).theme.id,'08-light-snow');
 delete require.cache[require.resolve(root+'backgrounds')];const fresh=require(root+'backgrounds');A.deepEqual(fresh.preferences(),{mode:'manual',themeId:'08-light-snow'});await fresh.apply();A.equal(requests.length,1);
 await fresh.save({mode:'manual',themeId:catalog[0].id});A.equal(fresh.display().src,'/assets/spring-morning.jpg');A.equal(data.size,1);
});
test('slow previous download cannot overwrite a later choice or restoration of local spring',async t=>{
 const {B,done,requests}=setup(t),first=B.save({mode:'manual',themeId:catalog[1].id}),second=B.save({mode:'manual',themeId:catalog[2].id});
 A.equal(requests.length,2);done(1);await second;done(0);await first;A.equal(B.display().id,catalog[2].id);A.equal(B.display().mirrored,true);
 const third=B.save({mode:'manual',themeId:catalog[3].id});await B.save({mode:'manual',themeId:catalog[0].id});done(2);await third;A.equal(B.display().id,catalog[0].id);A.equal(B.display().mirrored,true);
});
test('download failure keeps selected preference, shows spring, and retries successfully',async t=>{
 const {B,requests,done}=setup(t),p=B.save({mode:'manual',themeId:catalog[1].id});requests[0].fail(Error('offline'));await p;
 A.equal(B.display().status,'fallback');A.equal(B.preferences().themeId,catalog[1].id);A.equal(B.display().src,B.FALLBACK);A.equal(B.display().mirrored,true);
 const retry=B.apply();A.equal(requests.length,2);done(1);await retry;A.equal(B.display().id,catalog[1].id);A.equal(B.display().mirrored,false);
});
test('failed local save does not change preference; catalog accepts only versioned known cloud assets',async t=>{
 const {B,requests}=setup(t);wx.setStorageSync=()=>{throw Error('disk full');};A.throws(()=>B.save({mode:'manual',themeId:catalog[0].id}),/disk full/);A.equal(B.preferences().mode,'auto');
 wx.cloud.callFunction=async()=>({result:{ok:true,data:{items:[{...catalog[0],fileID:'https://untrusted.example/fake.jpg'}]}}});
 await B.refreshCatalog(true);A.equal(requests.length,0);A.ok(B.items().every(x=>!x.fileID.includes('untrusted')));
});
test('cloud theme install uses only fixed validated seeds, is idempotent, and list excludes disabled entries',async()=>{
 const {createService}=require('../cloudfunctions/qingyeThemes/catalog-service'),docs=new Map();let uploads=0;
 const api=createService({ensure:async()=>{},get:async id=>docs.get(id),set:async(id,d)=>docs.set(id,structuredClone(d))},async s=>{uploads++;return 'cloud://test/'+s.cloudPath;});
 await A.rejects(()=>api.seedAsset('../../users'),/未知背景/);A.equal(uploads,0);
 const one=await api.seedAsset(catalog[0].id);A.equal(one.asset,undefined);await api.seedAsset(catalog[0].id);A.equal(uploads,1);A.equal((await api.list()).items.length,1);
 docs.get('v1_'+catalog[0].id).enabled=false;await api.seedAsset(catalog[0].id);A.equal((await api.list()).items.length,0);A.equal(uploads,1);
});
