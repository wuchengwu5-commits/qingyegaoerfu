const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const calls=[],toasts=[];let user={uid:'owner'},status='本机已保存 · 待同步',modal;
 const account={user:()=>user,needLogin:()=>!!user};
 const personal={sync:async()=>{calls.push('private');status='已保存到账号';return true;},status:()=>status,error:()=>''};
 const cloud={flush:async()=>calls.push('shared-owner')};
 const deps={'./account':account,'./personal-sync':personal,'./cloud-sync':cloud,'./dialog':{modal:o=>{modal=o;}},'./ui':{go:route=>calls.push(route)}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/services/score-sync-action'),'utf8'),{module,require:n=>deps[n],wx:{showToast:o=>toasts.push(o.title)}});
 const r={id:'r',ownerUid:'owner',scores:{me:{1:{strokes:5}}}};
 const p={rid:'r',boardVisible:true,data:{},viewedRound:()=>r,setData(v){Object.assign(this.data,v);},refresh(){calls.push('refresh');},pollBoard:async()=>calls.push('poll'),pendingCells:()=>[],resolveCellConflict:()=>calls.push('cell-conflict'),resolveBoard:()=>calls.push('round-conflict'),refreshScoreSync:module.exports};
 return {p,r,calls,toasts,personal,cloud,modal:()=>modal,login:v=>user=v,status:v=>status=v};
}
test('refresh follows the existing private/shared channel and preserves recorded scores',async()=>{
 for(const kind of ['private','live','remote','shared-owner']){const x=setup(),before=JSON.stringify(x.r);if(kind==='live')x.p.data.liveBoard=true;if(kind==='remote')x.p.remoteRef={activityId:'a',groupId:'g'};if(kind==='shared-owner')x.r.cloud={ownerUid:'owner'};const scores=JSON.stringify(x.r.scores);await x.p.refreshScoreSync();A.equal(x.calls[0],kind==='live'||kind==='remote'?'poll':kind);A.equal(JSON.stringify(x.r.scores),scores);A.equal(x.p.data.manualSyncBusy,false);A.ok(!x.calls.includes('enableSharing'));if(kind==='private')A.equal(JSON.stringify(x.r),before);}
});
test('unclaimed, foreign, logged-out and correction records are not uploaded by refresh',async()=>{
 const x=setup();delete x.r.ownerUid;await x.p.refreshScoreSync();A.equal(x.calls.length,0);A.match(x.modal().content,/确认归属/);x.modal().success({confirm:false});A.equal(x.calls.length,0);x.modal().success({confirm:true});A.deepEqual(x.calls,['history']);A.equal(x.r.ownerUid,undefined);
 for(const kind of ['foreign','logged-out','editing']){const q=setup();if(kind==='foreign')q.r.ownerUid='another';if(kind==='logged-out')q.login(null);if(kind==='editing')q.p.data.editing=true;await q.p.refreshScoreSync();A.equal(q.calls.length,0);}
});
test('offline failures and conflicts are surfaced without claiming successful backup',async()=>{
 const x=setup();x.personal.sync=async()=>false;x.personal.error=()=> '网络暂不可用';await x.p.refreshScoreSync();A.deepEqual(x.toasts,['网络暂不可用']);
 const y=setup();y.p.data.liveBoard=true;y.p.pollBoard=async()=>{y.p.data.boardError='本机已记，联网后继续同步';};await y.p.refreshScoreSync();A.match(y.toasts[0],/联网/);
 for(const key of ['conflictCellCount','boardConflict']){const z=setup();z.p.data[key]=1;await z.p.refreshScoreSync();A.deepEqual(z.calls,[key==='conflictCellCount'?'cell-conflict':'round-conflict']);A.equal(z.toasts.length,0);}
});
test('repeated taps run one request; hidden pages and changed accounts ignore late feedback',async()=>{
 for(const end of ['visible','hidden','account']){const x=setup();let release;x.personal.sync=()=>new Promise(resolve=>{x.calls.push('private');release=resolve;});const request=x.p.refreshScoreSync();await x.p.refreshScoreSync();A.deepEqual(x.calls,['private']);if(end==='hidden')x.p.boardVisible=false;if(end==='account')x.login({uid:'other'});release(true);await request;A.equal(x.toasts.length,end==='visible'?1:0);A.equal(x.calls.filter(v=>v==='refresh').length,end==='visible'?1:0);A.equal(x.p.manualSyncing,null);}
});
