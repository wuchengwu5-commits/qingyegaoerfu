const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{createAvatarPresenter}=require('../cloudfunctions/qingye/avatar-links');
const {uidFor}=require('../cloudfunctions/qingye/domain'),{round}=require('./helpers/closure.cjs'),View=require('../miniprogram/services/score-view');
const root='cloud://test/profiles/',file=(uid,name='one')=>root+uid+'/avatar-'+name+'.png';
const result=ids=>({fileList:ids.map(({fileID})=>({fileID,status:0,tempFileURL:'https://avatars.test/'+encodeURIComponent(fileID)}))});
test('only trusted profile avatar paths are signed; scores and snapshots keep stable file IDs',async()=>{
 const calls=[],present=createAvatarPresenter({avatarRoot:root,getTempFileURL:async q=>{calls.push(q);return result(q.fileList);}});
 const board={version:1,round:{players:[{avatarUrl:file('a')}],scores:{me:{1:{grossStrokes:5}}}},profiles:[
  {uid:'a',avatarUrl:file('a')},{uid:'a',avatarUrl:file('a')},{uid:'b',avatarUrl:file('a')},
  {uid:'c',avatarUrl:root+'c/../a/avatar-one.png'},{uid:'d',avatarUrl:'cloud://other/profiles/d/avatar-one.png'},
  {uid:'e',avatarUrl:root+'e/private.txt'},{uid:'f',avatarUrl:'wxfile://tmp-local.png'}]};
 const before=JSON.stringify(board),out=await present(board);
 A.equal(calls.length,1);A.deepEqual(calls[0].fileList,[{fileID:file('a'),maxAge:3600}]);
 A.match(out.profiles[0].avatarUrl,/^https:/);A.equal(out.profiles[1].avatarUrl,out.profiles[0].avatarUrl);
 A.deepEqual(out.profiles.slice(2),board.profiles.slice(2));A.equal(JSON.stringify(board),before);A.deepEqual(out.round,board.round);
});
test('cached URLs renew before expiry and a new avatar file is resolved immediately',async()=>{
 let time=1000,calls=0;const present=createAvatarPresenter({avatarRoot:root,now:()=>time,getTempFileURL:async q=>{calls++;const r=result(q.fileList);r.fileList.forEach(x=>x.tempFileURL+='?request='+calls);return r;}});
 const board={profiles:[{uid:'a',avatarUrl:file('a')}]};const first=await present(board);
 A.equal((await present(board)).profiles[0].avatarUrl,first.profiles[0].avatarUrl);A.equal(calls,1);
 time+=46*60*1000;A.notEqual((await present(board)).profiles[0].avatarUrl,first.profiles[0].avatarUrl);A.equal(calls,2);
 await present({profiles:[{uid:'a',avatarUrl:file('a','two')}]});A.equal(calls,3);
});
test('per-file failures and transport errors preserve the board and retry at the next refresh',async()=>{
 let calls=0;const present=createAvatarPresenter({avatarRoot:root,getTempFileURL:async q=>{
  calls++;if(calls===1)throw Error('offline');if(calls===2)return {fileList:q.fileList.map(x=>({...x,status:-1,tempFileURL:'https://invalid.test'}))};return result(q.fileList);
 }}),board={version:3,profiles:[{uid:'a',avatarUrl:file('a')}]};
 A.deepEqual(await present(board),board);A.deepEqual(await present(board),board);A.match((await present(board)).profiles[0].avatarUrl,/^https:/);A.equal(calls,3);
 await present({version:3});await present({profiles:[]});A.equal(calls,3);
});
test('file conversion batches stay within the service limit',async()=>{
 const sizes=[],present=createAvatarPresenter({avatarRoot:root,getTempFileURL:async q=>{sizes.push(q.fileList.length);return result(q.fileList);}});
 const out=await present({profiles:Array.from({length:101},(_,i)=>({uid:'u'+i,avatarUrl:file('u'+i)}))});
 A.deepEqual(sizes,[50,50,1]);A.ok(out.profiles.every(p=>p.avatarUrl.startsWith('https://')));
});
function server(){
 const appid='wx771368adc305a848',avatarRoot='cloud://cloud1-d7gketoi570d17f80.636c-cloud1-d7gketoi570d17f80-1524135194/profiles/';
 let actor='host';const records={},signed=[],uids=Object.fromEntries(['host','guest','outsider'].map(x=>[x,uidFor(x,appid)]));
 const avatar=(name,suffix='one')=>avatarRoot+uids[name]+'/avatar-'+suffix+'.png';
 for(const [name,uid] of Object.entries(uids))records['qy_users:'+uid]={uid,name,avatarUrl:avatar(name),phone:{number:'13800000000',verifiedAt:1},friendUids:[],activityIds:[]};
 const db={collection:c=>({doc:id=>({get:async()=>{const data=records[c+':'+id];if(!data)throw Error('not found');return {data:structuredClone(data)};},set:async({data})=>{records[c+':'+id]=structuredClone(data);}})}),runTransaction:fn=>fn(db)};
 const cloud={init(){},database:()=>db,getWXContext:()=>({APPID:appid,OPENID:actor}),getTempFileURL:async q=>{signed.push(q);return result(q.fileList);},openapi:{phonenumber:{getPhoneNumber(){throw Error('not used');}}}};
 const filename=path.resolve(__dirname,'../cloudfunctions/qingye/index.js'),exports={};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{exports,process,Date,require:id=>id==='wx-server-sdk'?cloud:createRequire(filename)(id)});
 const call=async(name,action,input={})=>{actor=name;return exports.main({action,...input});};
 return {call,records,signed,uids,avatar};
}
async function joined(x){
 const enabled=await x.call('host','enableBoard',{round:round(1,18)});A.equal(enabled.ok,true);
 const ref={activityId:enabled.data.activityId,groupId:enabled.data.groupId},invite=await x.call('host','invite',{...ref,kind:'live'});
 A.equal((await x.call('guest','join',{token:invite.data.token,seatId:'+'})).ok,true);return ref;
}
test('two accounts see each other through authorized readBoard URLs, including profile-only updates',async()=>{
 const x=server(),ref=await joined(x),before=JSON.stringify(x.records);
 for(const actor of ['host','guest']){
  const response=await x.call(actor,'readBoard',ref);A.equal(response.ok,true);
  A.equal(response.data.profiles.length,2);A.ok(response.data.profiles.every(p=>p.avatarUrl.startsWith('https://')));
  const view=View.liveTable(response.data.round,p=>p.name,response.data.profiles);A.ok(view.tablePlayers.every(p=>p.avatarUrl.startsWith('https://')));
  A.ok(response.data.round.players.every(p=>p.avatarUrl.startsWith('cloud://')));
 }
 A.equal(JSON.stringify(x.records),before,'reading avatars must not rewrite any account or score');
 const old=await x.call('host','readBoard',ref),updated=await x.call('guest','profile',{name:'新昵称',avatarUrl:x.avatar('guest','two')});A.equal(updated.ok,true);
 const refreshed=await x.call('host','readBoard',{...ref,version:old.data.version,includeProfiles:true});
 A.equal(refreshed.data.round,undefined);A.equal(refreshed.data.version,old.data.version);A.equal(refreshed.data.profiles.find(p=>p.uid===x.uids.guest).name,'新昵称');A.ok(decodeURIComponent(refreshed.data.profiles.find(p=>p.uid===x.uids.guest).avatarUrl).endsWith('avatar-two.png'));
 A.equal((await x.call('guest','login')).data.avatarUrl,x.avatar('guest','two'),'own profile retains the upload file ID');
});
test('the cloud entry authorizes before signing and ignores client-supplied file lists/profiles',async()=>{
 const x=server(),ref=await joined(x);
 const denied=await x.call('outsider','readBoard',{...ref,includeProfiles:true,profiles:[{uid:x.uids.outsider,avatarUrl:x.avatar('outsider')}],fileList:[x.avatar('host')]});
 A.equal(denied.ok,false);A.equal(denied.code,'FORBIDDEN');A.equal(x.signed.length,0);
 const allowed=await x.call('host','readBoard',{...ref,profiles:[{uid:x.uids.outsider,avatarUrl:x.avatar('outsider')}],fileList:[x.avatar('outsider')]});A.equal(allowed.ok,true);
 A.ok(x.signed.flatMap(q=>q.fileList).every(f=>f.fileID!==x.avatar('outsider')));
 const count=x.signed.length;A.equal((await x.call('outsider','readBoard',ref)).ok,false);A.equal(x.signed.length,count,'warm cache cannot bypass membership');
});
