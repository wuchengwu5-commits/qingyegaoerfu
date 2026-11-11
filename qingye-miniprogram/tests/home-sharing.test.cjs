const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../miniprogram');
function home(){
 let page;
 vm.runInNewContext(fs.readFileSync(path.join(root,'pages/home/index.js'),'utf8'),{
  Page:p=>{page=p;},
  require:id=>id.endsWith('/weather')?{state:()=>({}),view:()=>({})}:id.endsWith('/backgrounds')?{FALLBACK_THEME:{mirrored:false}}:{}
 });
 return page;
}
test('the homepage enables both WeChat share callbacks without login or network access',()=>{
 const page=home();
 A.equal(typeof page.onShareAppMessage,'function');
 A.equal(typeof page.onShareTimeline,'function');
 const friend=page.onShareAppMessage(),timeline=page.onShareTimeline();
 A.ok(friend.title.includes('青野高尔夫'));
 A.equal(timeline.title,friend.title);
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
