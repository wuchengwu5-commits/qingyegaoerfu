const R=require('./rules'),C=require('./catalog'),V=require('./service'),catalog=require('./courses-data');
const Maintenance=require('./storage-maintenance');
const KEY='greenGolf.v3',OLD='greenGolf.v1',BACKUP='greenGolf.pre-v3',MARK='greenGolf.activeVersion';
const courses=catalog.courses;let editing=null,storageError='';
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const date=t=>new Date(t).toISOString().slice(0,10).replace(/-/g,'.');
function initial(){return {version:3,profile:{id:'me',name:'高球爱好者',goal:'享受每次挥杆'},friends:[],rounds:[],settings:{unit:'yd',technical:false},favorites:[],templates:[],courses:[],dbRevision:0};}
function write(d){const data=R.clone(d);data.rounds=(data.rounds||[]).map(require('./round-archive').compact);data.courses=(data.courses||[]).filter(c=>!c.publicData);const previous=wx.getStorageSync(KEY);try{wx.setStorageSync(KEY,data);const saved=wx.getStorageSync(KEY);if(JSON.stringify(saved)!==JSON.stringify(data))throw Error('存储校验不一致');}catch(e){if(previous)try{wx.setStorageSync(KEY,previous);}catch(ignore){}throw Error(/storage.*(max|size|full)|exceed.*storage|quota/i.test(e.message||e.errMsg||'')?'本机存储空间不足，本次操作未保存，已有球局和成绩仍保留':'保存失败，原记录保留：'+e.message);}return d;}
function init(){let existing=wx.getStorageSync(KEY);if(existing){const compact=Maintenance.compactData(existing);if(compact!==existing){write(compact);existing=compact;}}Maintenance.migratePendingOnce();if(wx.getStorageSync(MARK)===3&&existing)return existing;if(existing){R.migrateV1(existing);wx.setStorageSync(MARK,3);return existing;}const old=wx.getStorageSync(OLD);if(old)wx.setStorageSync(BACKUP,R.clone(old));const d=old?R.migrateV1(old):initial();write(d);R.migrateV1(d);wx.setStorageSync(MARK,3);return d;}
function read(){try{const d=V.hydrate(init(),courses);storageError='';return d;}catch(e){storageError='升级未完成，暂时只读：'+e.message;const old=wx.getStorageSync(OLD)||wx.getStorageSync(BACKUP);if(old)return V.hydrate(old,courses);throw e;}}
function displayProfiles(){const d=init();return [...(d.friends||[]),d.profile].filter(Boolean);}
function storageStatus(){return storageError;}
function retryUpgrade(){init();storageError='';return read();}
function mutate(fn){const d=read();if(storageError)throw Error(storageError);const ret=fn(d);d.dbRevision=(d.dbRevision||0)+1;write(d);return ret;}
function active(){return read().rounds.find(r=>r.status==='active');}
function getRound(rid){if(editing?.id===rid)return R.clone(editing.copy);try{const r=init().rounds.find(r=>r.id===rid);return r?R.migrateRound(r):undefined;}catch(e){return read().rounds.find(r=>r.id===rid);}}
function replace(r){if(editing?.id===r.id){editing.copy=R.clone(r);return r;}const result=mutate(d=>{const i=d.rounds.findIndex(x=>x.id===r.id);if(i<0)throw Error('球局不存在');d.rounds[i]=R.clone(r);return r;});if(r.cloud)require('./cloud-sync').enqueue(result);else require('./personal-sync').enqueue(result);return result;}
function create(opts){const result=mutate(d=>{const c=courses.find(c=>c.id===opts.courseId);if(!c)throw Error('请选择球场');const players=opts.players||[d.profile,...d.friends.filter(p=>(opts.friendIds||[]).includes(p.id))].map(p=>({...p,tee:opts.tee||c.tees[0]}));if(players.length>R.GROUP_MAX_PLAYERS)throw Error('每组最多 16 名球员，请重新分组');const r=V.newRound(c,players,{...opts,distanceUnit:opts.distanceUnit||(d.settings.unit==='m'?'m':'yd'),id:id(),now:Date.now(),date:new Date().toISOString().slice(0,10),time:'08:30',holes:opts.mode||'all'});if(d.profile.accountUid)r.ownerUid=d.profile.accountUid;d.settings.unit=r.distanceUnit;d.rounds.unshift(r);d.draft=null;return r;});require('./personal-sync').enqueue(result);return result;}
function operate(rid,op){
 const apply=r=>R.applyOperation(r,{...op,operationId:op.operationId||id(),baseRevision:op.baseRevision??r.revision,time:Date.now()});
 if(editing?.id===rid){const n=apply(editing.copy);editing.copy=R.clone(n);return n;}
 // Score one round without hydrating the public course catalog or historical rounds.
 const d=init(),index=d.rounds.findIndex(r=>r.id===rid);
 if(index<0)throw Error('球局不存在');
 const n=apply(R.migrateRound(d.rounds[index]));d.rounds[index]=n;d.dbRevision=(d.dbRevision||0)+1;write(d);
 if(n.cloud)require('./cloud-sync').enqueue(n);else require('./personal-sync').enqueue(n);return n;
}
function saveScore(rid,pid,n,s){return operate(rid,{type:'score',playerId:pid,holeNumber:n,score:s?{...s,grossStrokes:s.strokes??s.grossStrokes}:null});}
function finish(rid,options){return replace(V.finishRound(getRound(rid),Date.now(),options));}
function startEdit(rid){const r=read().rounds.find(r=>r.id===rid);editing={id:rid,original:R.clone(r),copy:{...R.clone(r),status:'active'}};return getRound(rid);}
function commitEdit(reason){if(!editing)throw Error('未进入更正模式');const e=editing,n=R.applyOperation(e.original,{type:'correction',operationId:id(),baseRevision:e.original.revision,time:Date.now(),reason,changes:{scores:e.copy.scores,events:e.copy.events,awards:e.copy.awards,ruleSnapshot:e.copy.ruleSnapshot,holes:e.copy.holes,players:e.copy.players,courseSnapshot:e.copy.courseSnapshot}});mutate(d=>{const i=d.rounds.findIndex(r=>r.id===e.id);if(d.rounds[i].revision!==e.original.revision)throw Error('球局已有其他变更');d.rounds[i]=n;});editing=null;if(n.cloud)require('./cloud-sync').enqueue(n);else require('./personal-sync').enqueue(n);return n;}
function cancelEdit(){editing=null;}function isEditing(rid){return editing?.id===rid;}
function stats(filter='strict',size=18){const s=V.stats(read(),size,0,Date.now(),filter);return {...s,best:s.best??'—',avg:s.average==null?'—':s.average.toFixed(1),putts:s.puttN?(s.putts/s.puttN).toFixed(1):'—',fwRate:s.fwN?Math.round(s.fw/s.fwN*100)+'%':'—',girRate:s.girN?Math.round(s.gir/s.girN*100)+'%':'—',trend:s.trend.map(x=>({...x,score:x.total,shortDate:x.date.slice(5),played:size,height:Math.max(10,Math.min(100,x.total/size/8*100))}))};}
function importData(raw){const next=V.hydrate(JSON.parse(raw),courses);const previous=wx.getStorageSync(KEY);wx.setStorageSync('greenGolf.beforeImport',previous);write(next);}
module.exports={KEY,init,read,write,displayProfiles,storageStatus,retryUpgrade,mutate,courses,getRound,active,create,replace,saveScore,finish,stats,date,importData,id,operate,startEdit,commitEdit,cancelEdit,isEditing};
