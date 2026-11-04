const crypto=require('crypto'),R=require('./lib/rules');
const {maskedPhone}=require('./phone');
const copy=x=>JSON.parse(JSON.stringify(x));
function fail(code,message){const e=Error(message);e.code=code;throw e;}
function text(v,max=40){return typeof v==='string'?v.trim().slice(0,max):'';}
function uidFor(openid,appid){return 'u'+crypto.createHash('sha256').update(appid+':'+openid).digest('hex').slice(0,24);}
function createService(repo,{now=()=>Date.now(),random=()=>crypto.randomBytes(12).toString('hex'),verifyPhone,avatarRoot=''}={}){
 async function dispatch(uid,action,input={}){
  if(!uid)fail('AUTH','请先微信登录');
  const publicUser=u=>({uid:u.uid,name:u.name,avatarUrl:u.avatarUrl||''});
  const ownUser=u=>({...publicUser(u),phoneVerified:!!u.phone?.verifiedAt,phoneMasked:maskedPhone(u.phone),profileCompleted:!!u.profileCompleted,handicapSetting:u.handicapSetting,handicapInputs:u.handicapInputs});
  const authorized=(a,u)=>a.ownerUid===u||a.viewerUids.includes(u)||a.groups.some(g=>g.memberUids.includes(u));
  async function activity(tx,id){const a=await tx.get('qy_activities',id);if(!a)fail('NOT_FOUND','活动不存在');return a;}
  function ownGroup(a,id){const g=a.groups.find(g=>g.id===id);if(!g||g.ownerUid!==uid)fail('FORBIDDEN','只有本组记分员可以操作');return g;}
  if(action==='phoneLogin'){
   if(!verifyPhone)fail('PHONE_REQUIRED','请先完成手机号验证');
   const phone=await verifyPhone(input.code);
   return repo.transaction(async tx=>{
    const u=await tx.get('qy_users',uid)||{uid,name:'高球爱好者',friendUids:[],activityIds:[],createdAt:now()};
    // Preserve the existing UID, scores and membership when upgrading an old account.
    u.phone=phone;u.lastLoginAt=now();await tx.set('qy_users',uid,u);return ownUser(u);
   });
  }
  const me=await repo.get('qy_users',uid);if(!me?.phone?.verifiedAt)fail('PHONE_REQUIRED','请先通过手机号快捷登录完成验证');
  if(action==='login')return ownUser(me);
  if(action==='profile')return repo.transaction(async tx=>{
   const u=await tx.get('qy_users',uid),name=typeof input.name==='string'?input.name.trim():'';
   if(!name||name.length>16)fail('INVALID','昵称为 1–16 个字');
   if(input.avatarUrl!==undefined){
    const url=input.avatarUrl;
    if(typeof url!=='string'||url.length>512||url&&(!avatarRoot||!url.startsWith(avatarRoot+uid+'/')||!/\/avatar-[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/.test(url)))fail('INVALID','请重新选择头像');
    u.avatarUrl=url;
   }
   u.name=name;u.profileCompleted=true;await tx.set('qy_users',uid,u);return ownUser(u);
  });
  if(action==='handicap')return repo.transaction(async tx=>{
   const u=await tx.get('qy_users',uid),s=input.setting;
   if(!s||!['auto','manual'].includes(s.mode)||s.mode==='manual'&&(!Number.isFinite(s.value)||s.value< -10||s.value>54))fail('INVALID','差点设置无效');
   u.handicapSetting={mode:s.mode,...(s.mode==='manual'?{value:s.value}:{}),updatedAt:now()};await tx.set('qy_users',uid,u);return u.handicapSetting;
  });
  if(action==='friends'){const users=await Promise.all(me.friendUids.map(id=>repo.get('qy_users',id)));return users.filter(Boolean).map(publicUser);}
  if(action==='rating')return repo.transaction(async tx=>{
   const u=await tx.get('qy_users',uid);let found=null,player=null;
   for(const id of u.activityIds){const a=await tx.get('qy_activities',id);for(const g of a?.groups||[]){if(g.memberUids.includes(uid)&&g.round?.id===input.roundId){found=copy(g.round);player=found.players.find(p=>p.accountUid===uid);}}}
   if(!found||!player)fail('FORBIDDEN','只能填写自己参与球局的评级资料');
   const v=input.values||{};found.handicapInputs={...found.handicapInputs,[player.id]:v};if(require('./lib/handicap').differential(found,player.id)===null)fail('INVALID','评级资料不完整或成绩不符合要求');
   u.handicapInputs={...u.handicapInputs,[found.id]:{tee:v.tee,courseRating:v.courseRating,slopeRating:v.slopeRating,adjustedGross:v.adjustedGross,pcc:v.pcc,confirmed:true}};await tx.set('qy_users',uid,u);return true;
  });
  if(action==='removeFriend')return repo.transaction(async tx=>{const u=await tx.get('qy_users',uid);u.friendUids=u.friendUids.filter(id=>id!==input.uid);await tx.set('qy_users',uid,u);return true;});
  if(action==='list'){const list=await Promise.all(me.activityIds.slice(-50).map(id=>repo.get('qy_activities',id)));return list.filter(a=>a&&authorized(a,uid)).reverse().map(a=>({id:a.id,title:a.title,courseName:a.courseName,groupCount:a.groups.length,updatedAt:a.updatedAt}));}
  if(action==='create')return repo.transaction(async tx=>{
   const u=await tx.get('qy_users',uid),id=random(),gid=random(),courseId=text(input.courseId,80),courseName=text(input.courseName,80);if(!courseId||!courseName)fail('INVALID','请先选择球场');
   const a={id,title:text(input.title)||courseName+' · 同行活动',courseId,courseName,ownerUid:uid,viewerUids:[],groups:[{id:gid,name:'第 1 组',ownerUid:uid,memberUids:[uid],version:0,round:null}],createdAt:now(),updatedAt:now()};
   u.activityIds=[...u.activityIds,id].slice(-50);await tx.set('qy_activities',id,a);await tx.set('qy_users',uid,u);return {activityId:id,groupId:gid};
  });
  if(action==='invite')return repo.transaction(async tx=>{
   const a=await activity(tx,input.activityId),g=ownGroup(a,input.groupId);if(!['join','group','watch'].includes(input.kind))fail('INVALID','邀请类型无效');
   if(input.kind==='join'&&(g.round||g.locked))fail('STARTED','已开局，本组成员已锁定');
   const token=random();await tx.set('qy_invites',token,{token,activityId:a.id,groupId:g.id,kind:input.kind,issuerUid:uid,expiresAt:now()+7*86400000,revoked:false});return {token,kind:input.kind,expiresAt:now()+7*86400000};
  });
  if(action==='revoke')return repo.transaction(async tx=>{const inv=await tx.get('qy_invites',input.token);if(!inv||inv.issuerUid!==uid)fail('FORBIDDEN','不能撤销此邀请');inv.revoked=true;await tx.set('qy_invites',input.token,inv);return true;});
  async function invitation(tx){if(!/^[a-f0-9]{24}$/.test(input.token||''))fail('INVALID','邀请链接无效');const inv=await tx.get('qy_invites',input.token);if(!inv||inv.revoked||inv.expiresAt<=now())fail('EXPIRED','邀请已失效，请向发起人索取新邀请');return inv;}
  if(action==='invitation'){const inv=await invitation(repo),a=await activity(repo,inv.activityId),g=a.groups.find(g=>g.id===inv.groupId);return {title:a.title,courseName:a.courseName,groupName:g?.name,kind:inv.kind,expiresAt:inv.expiresAt};}
  if(action==='join')return repo.transaction(async tx=>{
   const inv=await invitation(tx),a=await activity(tx,inv.activityId),u=await tx.get('qy_users',uid);let g;
   if(inv.kind==='join'){
    g=a.groups.find(x=>x.id===inv.groupId);if(!g)fail('NOT_FOUND','小组不存在');
    if(!g.memberUids.includes(uid)){if(g.round||g.locked)fail('STARTED','本组已开始记分，成员已锁定');if(g.memberUids.length>=4)fail('FULL','本组已满 4 人');if(a.groups.some(x=>x.memberUids.includes(uid)))fail('ALREADY_JOINED','你已在此活动的另一组');
     const colleagues=await Promise.all(g.memberUids.map(id=>tx.get('qy_users',id)));
     for(const friend of colleagues){u.friendUids=Array.from(new Set([...u.friendUids,friend.uid]));friend.friendUids=Array.from(new Set([...friend.friendUids,uid]));await tx.set('qy_users',friend.uid,friend);}g.memberUids.push(uid);
    }
   }else if(inv.kind==='group'){
    g=a.groups.find(x=>x.memberUids.includes(uid));if(!g){if(a.groups.length>=20)fail('FULL','本活动最多 20 组');g={id:random(),name:'第 '+(a.groups.length+1)+' 组',ownerUid:uid,memberUids:[uid],version:0,round:null};a.groups.push(g);}
   }else{if(!authorized(a,uid)){if(a.viewerUids.length>=80)fail('FULL','观看人数已达上限');a.viewerUids.push(uid);}}
   u.activityIds=Array.from(new Set([...u.activityIds,a.id])).slice(-50);a.updatedAt=now();await tx.set('qy_users',uid,u);await tx.set('qy_activities',a.id,a);return {activityId:a.id,groupId:g?.id||null};
  });
  if(action==='get'){
   const a=await activity(repo,input.activityId);if(!authorized(a,uid))fail('FORBIDDEN','请先通过邀请加入活动');const ids=Array.from(new Set(a.groups.flatMap(g=>g.memberUids))),users=await Promise.all(ids.map(id=>repo.get('qy_users',id))),names=Object.fromEntries(users.filter(Boolean).map(u=>[u.uid,u.name]));
   return {...a,viewerUids:undefined,groups:a.groups.map(g=>({...g,members:g.memberUids.map(id=>({uid:id,name:names[id]})),rows:g.round?g.round.players.map(p=>{const s=R.rawSummary(g.round,p.id);return {uid:p.accountUid,name:names[p.accountUid]||p.name,total:s.totalText,played:s.played,holes:g.round.holes.length,tee:p.tee};}):[],canScore:g.ownerUid===uid}))};
  }
  if(action==='myRounds'){
   const all=await Promise.all(me.activityIds.slice(-50).map(id=>repo.get('qy_activities',id))),out=[];
   for(const a of all.filter(Boolean))for(const g of a.groups){if(!g.memberUids.includes(uid)||!g.round)continue;const p=g.round.players.find(p=>p.accountUid===uid);if(p)out.push({round:g.round,playerId:p.id});}return out;
  }
  if(action==='lock')return repo.transaction(async tx=>{const a=await activity(tx,input.activityId),g=ownGroup(a,input.groupId);if(g.round)fail('STARTED','本组已有记分，请继续原球局');const members=await Promise.all(g.memberUids.map(id=>tx.get('qy_users',id)));g.locked=true;await tx.set('qy_activities',a.id,a);return members.map(publicUser);});
  if(action==='saveRound')return repo.transaction(async tx=>{
   const a=await activity(tx,input.activityId),g=ownGroup(a,input.groupId);if(input.mutationId&&g.lastMutation===text(input.mutationId,100))return {version:g.version};if(g.version!==input.expectedVersion)fail('CONFLICT','其他设备已更新成绩，不能覆盖');
   if(!input.round||JSON.stringify(input.round).length>350000)fail('INVALID','记分数据过大或无效');const r=copy(input.round);
   if(r.courseId!==a.courseId||![9,18].includes(r.holes?.length)||!Array.isArray(r.players)||r.players.length!==g.memberUids.length)fail('INVALID','球场或组员不匹配');
   const ids=r.players.map(p=>p.id==='me'?uid:p.id);if(new Set(ids).size!==ids.length||ids.some(id=>!g.memberUids.includes(id)))fail('INVALID','只能为本组已加入的微信成员记分');
   const profiles=await Promise.all(ids.map(id=>tx.get('qy_users',id)));r.players.forEach((p,i)=>{p.accountUid=ids[i];p.name=profiles[i].name;});
   R.validateRound(r);if(g.round&&g.round.id!==r.id)fail('CONFLICT','本组已有球局，请继续原球局');if(g.round&&r.revision<g.round.revision)fail('CONFLICT','本机成绩版本较旧');
   // Only explicit score fields are returned to other groups. Never store GPS,
   // local backups or full operation snapshots in the shared activity document.
   const allowed='id distanceUnit schemaVersion status revision courseId courseName city courseDemo photo date time createdAt updatedAt completedAt finishedAt courseSnapshot ruleSnapshot mainContestId holes playOrder holeOrder players scores currentHole currentPlayer events awards'.split(' ');
   for(const key of Object.keys(r))if(!allowed.includes(key))delete r[key];
   g.round=r;g.locked=true;g.lastMutation=text(input.mutationId,100);g.version++;a.updatedAt=now();await tx.set('qy_activities',a.id,a);return {version:g.version};
  });
  fail('INVALID','不支持此操作');
 }
 return {dispatch};
}
module.exports={createService,uidFor};
