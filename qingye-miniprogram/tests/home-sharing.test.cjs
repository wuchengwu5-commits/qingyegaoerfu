const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../miniprogram');
function home(backgrounds=require(root+'/services/backgrounds')){
 let page;
 const dependencies={backgrounds,weather:{state:()=>({}),view:()=>({}),subscribe:()=>()=>{}},scene:{topInset:()=>24},location:{subscribe:()=>()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'pages/home/index.js'),'utf8'),{
  Page:p=>{page=p;},
  require:id=>dependencies[id.split('/').at(-1)]||{},wx:global.wx||{}
 });
 page.setData=data=>Object.assign(page.data,data);
 return page;
}
test('the homepage enables both WeChat share callbacks without login or network access',()=>{
 const page=home();
 A.equal(typeof page.onShareAppMessage,'function');
 A.equal(typeof page.onShareTimeline,'function');
 const friend=page.onShareAppMessage(),timeline=page.onShareTimeline();
 A.ok(friend.title.includes('青野高尔夫'));
 A.equal(timeline.title,friend.title);
 A.equal(timeline.imageUrl,friend.imageUrl);
 A.equal(friend.path,'/pages/home/index');
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 A.ok(app.pages.includes(friend.path.slice(1)));
 A.ok(fs.statSync(path.join(root,friend.imageUrl)).size>0);
});
test('resharing the homepage never carries incoming invitations, private rounds, or location',()=>{
 const page=home();
 page.options={invite:'private-invite',id:'private-round',latitude:'31.23',longitude:'121.47'};
 page.data={profile:{phone:'private-phone'},active:{id:'private-round'}};
 const friend=page.onShareAppMessage({from:'menu'}),timeline=page.onShareTimeline();
 A.equal(friend.path,'/pages/home/index');
 A.equal(timeline.query,'');
 A.doesNotMatch(JSON.stringify([friend,timeline]),/private-|latitude|longitude/);
});
test('shares follow all eight live homepage backgrounds, automatic changes and failed downloads',async t=>{
 const previous=global.wx,storage=new Map(),requests=[];
 global.wx={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),getFileSystemManager:()=>({accessSync(){throw Error('not cached');},mkdirSync(){},copyFile:o=>o.success(),unlinkSync(){}}),cloud:{init(){},downloadFile:o=>requests.push(o)}};
 const modules=['backgrounds','media'].map(name=>require.resolve(root+'/services/'+name));
 for(const id of modules)delete require.cache[id];
 const B=require(root+'/services/backgrounds');
 t.after(()=>{B.pause();global.wx=previous;for(const id of modules)delete require.cache[id];});
 await B.save({mode:'manual',themeId:B.items()[0].id});
 const page=home(B);page.onLoad();t.after(()=>page.offBackground());
 let group;
 vm.runInNewContext(fs.readFileSync(path.join(root,'pages/groups/index.js'),'utf8'),{Page:p=>group=p,require:id=>id.endsWith('/backgrounds')?B:{}});
 function check(){
  const expected=B.display().src;
  A.equal(page.data.sceneSrc,expected);
  A.equal(page.onShareAppMessage().imageUrl,expected);
  A.equal(page.onShareTimeline().imageUrl,expected);
  group.data.invite=null;A.equal(group.onShareAppMessage().imageUrl,expected);
  group.data.invite={label:'球友',token:'invite-token'};
  const invitation=group.onShareAppMessage();A.equal(invitation.imageUrl,expected);A.equal(invitation.path,'/pages/groups/index?token=invite-token');
  A.notEqual(expected,'/assets/retreat.jpg');
 }
 check();
 for(const theme of B.items()){
  const before=requests.length,pending=B.save({mode:'manual',themeId:theme.id});
  check(); // While downloading, share exactly the background still visible on the homepage.
  if(requests.length>before)requests.at(-1).success({tempFilePath:'/temp/'+theme.id+'.jpg'});
  await pending;A.equal(B.display().id,theme.id);check();
 }
 storage.set('qingye.background.settings.v1',{mode:'auto'});
 const morning=B.apply(new Date(2026,6,15,6));requests.at(-1).success({tempFilePath:'/temp/dawn.jpg'});await morning;
 A.equal(B.display().id,'05-misty-dawn');check();
 const sunset=B.apply(new Date(2026,6,15,17));requests.at(-1).fail(Error('offline'));await sunset;
 A.equal(B.display().src,B.FALLBACK);check();
 const retry=B.apply(new Date(2026,6,15,17));requests.at(-1).success({tempFilePath:'/temp/sunset.jpg'});await retry;
 A.equal(B.display().id,'06-lakeside-sunset');check();
 B.imageFailed();A.equal(B.display().src,B.FALLBACK);check();
});
