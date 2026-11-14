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
test('a rejected map download can use the map cloud function and reuses the saved image',async t=>{
 const s=setup(t),m=s.load(),calls=[];
 const encoded=['/9j/','AA=='];
 wx.cloud.callFunction=async options=>{
  calls.push(options);
  const {index}=options.data;
  return {result:{ok:true,index,chunks:2,data:encoded[index]}};
 };
 s.fs.writeFile=o=>{A.equal(o.encoding,'base64');A.equal(o.data,encoded.join(''));s.files.add(o.filePath);o.success();};
 const read=m.local(source);
 s.requests[0].fail(Error('access denied'));
 const saved=await read;
 A.deepEqual(calls.map(o=>o.data),[0,1].map(index=>({action:'mapImage',name:'packages__sheshan-map__course-overview-tiles__0-0.jpg',index})));
 A.ok(calls.every(o=>o.name==='qingyeGpsMaps'&&o.config.env==='test-env'));
 A.equal(await m.local(source),saved);
 A.equal(s.requests.length,1);
});
test('media environment alone does not enable undeployed account functions',t=>{
 setup(t);config.cloudEnv='';const account=require('../miniprogram/services/account');A.equal(account.configured(),false);
});
test('login and imagery share one initialized WeChat cloud client',t=>{
 const s=setup(t);config.cloudEnv='test-env';let calls=0;wx.cloud.init=o=>{calls++;A.equal(o.env,'test-env');};
 s.load().init();require('../miniprogram/services/account').init();s.load().init();A.equal(calls,1);
});
test('reference artwork uses immutable cloud IDs, shared caching and retry without treating packaged PNGs as remote',async t=>{
 const s=setup(t),m=s.load(),src='cloud://test-env.test-bucket/hole-reference-v1/cn_bg_611/cn_bg_611_s3_h07-abcd.png';
 A.equal(m.remote(src),true);A.equal(m.fileID(src),src);A.equal(m.remote('/assets/nav-home.png'),false);
 const p=m.local(src);A.equal(s.requests[0].fileID,src);s.requests[0].success({tempFilePath:'/temp/reference.png'});const saved=await p;
 A.equal(await m.local(src),saved);A.equal(s.requests.length,1);m.forget(src);const retry=m.local(src);A.equal(s.requests.length,2);s.requests[1].success({tempFilePath:'/temp/reference-retry.png'});await retry;
});
test('reference PNG download failure uses the public artwork fallback and caches complete chunks',async t=>{
 const s=setup(t),m=s.load(),name='cn_bg_577/cn_bg_577_s3_h04-5c9193969f855c8f.png',src='cloud://test-env.test-bucket/hole-reference-v1/'+name,calls=[];
 wx.cloud.callFunction=async o=>{calls.push(o.data);return {result:{ok:true,index:o.data.index,chunks:2,data:o.data.index?'AA==':'iVBORw0KGgoA'}};};
 s.fs.writeFile=o=>{A.equal(o.data,'iVBORw0KGgoAAA==');s.files.add(o.filePath);o.success();};
 const read=m.local(src);s.requests[0].fail(Error('access denied'));const cached=await read;
 A.deepEqual(calls,[0,1].map(index=>({action:'referenceImage',name,index})));
 A.equal(await m.local(src),cached);A.equal(s.requests.length,1);
});
