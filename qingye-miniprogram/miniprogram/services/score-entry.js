const S=require('./store'),Account=require('./account');
const KEY='qingye.scoreEntry.v1',PLAY='pages/play/index';
let command=null,appEntry=false;
const top=()=>typeof getCurrentPages==='function'?getCurrentPages().slice(-1)[0]:null;
const uid=()=>Account.user()?.uid||'';
const active=r=>r&&['active','paused'].includes(r.status)&&!S.isEditing(r.id)&&!require('./round-history').backup(r);
function localAllowed(r){return active(r)&&(!r.ownerUid||r.ownerUid===uid())&&(!r.cloud||!!uid());}
function saved(){try{const p=wx.getStorageSync(KEY);return p?.version===1&&p.uid===uid()?p:null;}catch(_){return null;}}
function remember(options,round){
 if(!round||S.isEditing(round.id))return;
 if(!active(round)){forget(round.id);return;}
 const ref=options.activity&&options.group?{activity:options.activity,group:options.group}:null;
 if(ref&&!uid()||!ref&&!localAllowed(round))return;
 const cursor={holeId:round.holes.find(h=>h.number===round.currentHole)?.id,hole:round.currentHole,player:round.currentPlayer};
 const next={version:1,uid:uid(),id:round.id,...ref,cursor};
 try{if(JSON.stringify(saved())!==JSON.stringify(next))wx.setStorageSync(KEY,next);}catch(_){/* Navigation preferences must never block scoring. */}
}
function forget(id){try{const p=saved();if(p?.id===id)wx.setStorageSync(KEY,null);}catch(_){}}
function target(){
 const p=saved(),local=p?.id?S.getRound(p.id):null;
 if(p?.activity&&p.group&&uid()&&(!local||active(local)))return {activity:p.activity,group:p.group,id:p.id};
 if(localAllowed(local))return {id:local.id};
 const r=S.read().rounds.filter(localAllowed).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0))[0];
 return r?{id:r.id}:null;
}
function restoreCursor(options,round){
 const p=saved();if(!p||p.id!==round.id||p.activity!==options.activity||p.group!==options.group)return null;
 const h=round.holes.find(h=>p.cursor?.holeId?h.id===p.cursor.holeId:h.number===p.cursor?.hole);
 return {...round,currentHole:h?.number||round.currentHole,currentPlayer:round.players.some(x=>x.id===p.cursor?.player)?p.cursor.player:round.currentPlayer};
}
function dispatch(next){
 command=next;const p=top();
 if(p?.route===PLAY&&p.handleEntry){p.handleEntry();return;}
 wx.switchTab({url:'/'+PLAY,success:()=>{const page=top();if(page?.route===PLAY)page.handleEntry?.();},fail:()=>{if(command===next)command=null;wx.showToast({title:'记分页暂未打开，请重试',icon:'none'});}});
}
function consume(){const next=command;command=null;return next;}
function open(options){dispatch({kind:'score',options});}
function hub(){dispatch({kind:'hub'});}
function create(course){dispatch({kind:'create',course});}
function resume(){dispatch({kind:'resume'});}
// Only ordinary launcher entries may resume. Invitations, shares and unfinished
// subpages own their destination, including when account/network replies are late.
function onAppShow(options={}){
 appEntry=false;
 if(options.path&&!['pages/home/index',PLAY].includes(options.path))return;
 if(Object.keys(options.query||{}).length)return;
 if(options.scene&&![1001,1023,1089,1090].includes(Number(options.scene)))return;
 const p=top();if(p&&!['pages/home/index',PLAY,'pages/courses/index','pages/profile/index'].includes(p.route))return;
 appEntry=true;if(p)handleAppEntry();
}
function handleAppEntry(){
 if(!appEntry)return false;appEntry=false;
 try{if(target()){resume();return true;}}catch(_){}
 return false;
}
module.exports={KEY,PLAY,active,localAllowed,saved,target,remember,forget,restoreCursor,consume,open,hub,create,resume,onAppShow,handleAppEntry};
