const {test}=require('node:test'),A=require('node:assert/strict');
const View=require('../miniprogram/services/score-view'),Service=require('../miniprogram/services/service'),courses=require('../miniprogram/services/courses-data').courses;
test('live profiles supply scorecard names and avatars without replacing manual names or historical snapshots',()=>{
 const c=courses.find(c=>c.id==='cn_bg_519');const r=Service.newRound(c,[{id:'me',accountUid:'owner',name:'高球爱好者',tee:'Blue'},{id:'guest',accountUid:'guest',name:'高球爱好者',tee:'Blue'},{id:'manual',name:'球童代填',tee:'Blue'}],{id:'profile-test',now:1,date:'2026-11-11'});
 const before=JSON.stringify(r),profiles=[{uid:'owner',name:'吴先生',avatarUrl:'cloud://owner'},{uid:'guest',name:'陈先生',avatarUrl:'cloud://guest'}];
 const v=View.table(r,p=>p.id==='me'?'我':p.name,profiles);A.deepEqual(v.tablePlayers.map(p=>p.name),['我','陈先生','球童代填']);A.equal(v.tablePlayers[1].avatarUrl,'cloud://guest');A.match(v.tablePlayers[1].cells[0].aria,/陈先生/);A.equal(JSON.stringify(r),before);
});
