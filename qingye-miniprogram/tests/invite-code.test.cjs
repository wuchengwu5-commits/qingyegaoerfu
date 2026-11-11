const {test}=require('node:test'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(type='score'){
 const requests=[];global.wx={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getStorageSync:()=>'',setStorageSync(){}};
 const account={user:()=>({uid:'host'}),needLogin:()=>true,call:(action,data)=>new Promise((resolve,reject)=>requests.push({action,data,resolve,reject}))};
 const accountPath=require.resolve('../miniprogram/services/account');require.cache[accountPath]={id:accountPath,filename:accountPath,loaded:true,exports:account};
 delete require.cache[require.resolve('../miniprogram/services/invite-code')];
 let p;
 if(type==='score'){const file=require.resolve('../miniprogram/services/score-board-page');delete require.cache[file];p={...require(file),remoteRef:{activityId:'a',groupId:'g'},boardVisible:true,data:{r:{courseName:'测试球场'}},refresh(){},watchBoard(){}};}
 else{global.Page=x=>p=x;const file=require.resolve('../miniprogram/pages/groups/index');delete require.cache[file];require(file);p={...p,aid:'a',data:{...p.data,mine:{id:'g'}}};}
 p.setData=function(values){Object.assign(this.data,values)};return {p,requests};
}
const invitation=(kind='live')=>({token:kind.padEnd(24,'0'),kind,expiresAt:Date.now()+100000});
test('score invite opens immediately, automatically generates a development mini program code and shows it',async()=>{
 const {p,requests}=setup();const work=p.enableSharing();assert.equal(p.data.codeOpen,true);assert.equal(p.data.codeBusy,true);await tick();
 assert.equal(requests[0].action,'invite');requests[0].resolve(invitation());await tick();assert.equal(requests[1].action,'qrcode');assert.equal(requests[1].data.envVersion,'develop');requests[1].resolve({url:'https://test.invalid/code.jpg'});await work;
 assert.equal(p.data.boardCode,'https://test.invalid/code.jpg');assert.equal(p.data.codeBusy,false);assert.equal(p.data.codeVersion,'开发版');
});
test('closing a score invite cannot be undone by a late QR response',async()=>{
 const {p,requests}=setup();const work=p.inviteScorer();await tick();requests[0].resolve(invitation('scorer'));await tick();p.closeCode();requests[1].resolve({url:'https://test.invalid/old.jpg'});await work;
 assert.equal(p.data.codeOpen,false);assert.equal(p.data.boardCode,'');assert.equal(p.data.boardInvite,null);
});
test('invite creation failures remain visible in the dialog and retry with the original role',async()=>{
 const {p,requests}=setup();const work=p.inviteScorer();await tick();requests[0].reject(Error('连接中断'));await work;
 assert.equal(p.data.codeError,'连接中断');assert.equal(p.data.codeOpen,true);assert.equal(p.data.codeBusy,false);
 const retry=p.retryCode();await tick();assert.equal(requests[1].data.kind,'scorer');requests[1].resolve(invitation('scorer'));await tick();requests[2].resolve({url:'https://test.invalid/new.jpg'});await retry;assert.equal(p.data.boardCode,'https://test.invalid/new.jpg');
});
test('empty image responses are visible errors, and expired tokens are regenerated instead of retried forever',async()=>{
 const {p,requests}=setup();let work=p.enableSharing();await tick();requests[0].resolve(invitation());await tick();requests[1].resolve({});await work;assert.match(p.data.codeError,/暂未生成/);
 work=p.retryCode();requests[2].reject(Object.assign(Error('邀请已失效'),{code:'EXPIRED'}));await work;assert.equal(p.data.boardInvite,null);assert.equal(p.cachedInvite,null);
 work=p.retryCode();await tick();assert.equal(requests[3].action,'invite');p.closeCode();requests[3].resolve(invitation());await work;assert.equal(requests.length,4);
});
test('activity invites generate codes immediately without a second button press',async()=>{
 const {p,requests}=setup('groups');const work=p.invite({currentTarget:{dataset:{kind:'scorer'}}});assert.equal(p.data.codeOpen,true);requests[0].resolve(invitation('scorer'));await tick();assert.equal(requests[1].action,'qrcode');requests[1].resolve({url:'https://test.invalid/scorer.jpg'});await work;
 assert.equal(p.data.qrcode,'https://test.invalid/scorer.jpg');assert.equal(p.data.codeBusy,false);assert.equal(p.data.busy,false);
 p.codeImageError();assert.equal(p.data.qrcode,'');assert.match(p.data.codeError,/加载失败/);
});
test('closing an activity invitation while it is loading ignores its stale response',async()=>{
 const {p,requests}=setup('groups');const work=p.invite({currentTarget:{dataset:{kind:'join'}}});p.closeCode();requests[0].resolve(invitation('join'));await work;assert.equal(p.data.invite,null);assert.equal(p.data.codeOpen,false);assert.equal(requests.length,1);
});
