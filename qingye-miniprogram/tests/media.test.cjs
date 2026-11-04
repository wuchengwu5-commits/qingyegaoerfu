const {test}=require('node:test'),A=require('node:assert/strict'),path=require('node:path');
const config=require('../miniprogram/config'),modulePath=require.resolve('../miniprogram/services/media');
const source='/packages/sheshan-map/course-overview-tiles/0-0.jpg';
function setup(t){
 const original={...config},oldWx=global.wx,files=new Set(),requests=[];
 config.mediaEnv='test-env';config.mediaRoot='cloud://test-env.test-bucket/media-v1';
 const fs={accessSync(p){if(!files.has(p))throw Error('missing');},mkdirSync(){},copyFile(o){files.add(o.destPath);o.success();},unlinkSync(p){files.delete(p);}};
 global.wx={env:{USER_DATA_PATH:'/user'},getFileSystemManager:()=>fs,cloud:{init(){},downloadFile(o){requests.push(o);}}};
 function load(){delete require.cache[modulePath];return require(modulePath);}
 t.after(()=>{for(const key of Object.keys(config))delete config[key];Object.assign(config,original);global.wx=oldWx;delete require.cache[modulePath];});
 return {fs,files,requests,load};
}
test('cloud imagery downloads once, saves locally and survives a fresh app session',async t=>{
 const s=setup(t),m=s.load(),a=m.local(source),b=m.local(source);A.equal(a,b);A.equal(s.requests.length,1);
 A.equal(s.requests[0].fileID,config.mediaRoot+'/packages__sheshan-map__course-overview-tiles__0-0.jpg');
 A.equal(s.requests[0].config.env,'test-env');s.requests[0].success({tempFilePath:'/temp/image.jpg'});
 const saved=await a;A.ok(saved.startsWith('/user/qingye-media-v1/'));A.ok(s.files.has(saved));
 A.equal(await s.load().local(source),saved);A.equal(s.requests.length,1);
 A.equal(await m.local('/assets/nav-home.png'),'/assets/nav-home.png');
});
test('network failures are retryable and full local storage still displays the downloaded image',async t=>{
 const s=setup(t),m=s.load(),first=m.local(source);s.requests[0].fail(Error('offline'));await A.rejects(first,/offline/);
 s.fs.copyFile=o=>o.fail();const retry=m.local(source);A.equal(s.requests.length,2);s.requests[1].success({tempFilePath:'/temp/retry.jpg'});A.equal(await retry,'/temp/retry.jpg');
 m.forget(source);const again=m.local(source);s.requests[2].success({tempFilePath:'/temp/new.jpg'});A.equal(await again,'/temp/new.jpg');
});
test('media environment alone does not enable undeployed account functions',t=>{
 setup(t);config.cloudEnv='';const account=require('../miniprogram/services/account');A.equal(account.configured(),false);
});
test('login and imagery share one initialized WeChat cloud client',t=>{
 const s=setup(t);config.cloudEnv='test-env';let calls=0;wx.cloud.init=o=>{calls++;A.equal(o.env,'test-env');};
 s.load().init();require('../miniprogram/services/account').init();s.load().init();A.equal(calls,1);
});
