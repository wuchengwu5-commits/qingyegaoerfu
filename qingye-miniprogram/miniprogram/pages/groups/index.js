const B=require('../../services/backgrounds');
const S=require('../../services/store'),A=require('../../services/account'),Sync=require('../../services/cloud-sync'),{go}=require('../../services/ui');
function inviteToken(raw){
 if(!raw)return null;
 try{
  const value=decodeURIComponent(raw);
  return /^[a-f0-9]{24}$/.test(value)?value:null;
 }catch(_){return null;}
}
Page({data:{loggedIn:false,busy:false,error:'',activities:[],activity:null,invitation:null,invite:null,qrcode:'',course:null},onLoad(o={}){this.aid=o.activity||null;this.gid=o.group||null;this.token=inviteToken(o.token||o.scene);this.setData({hasInvite:!!(o.token||o.scene)});if((o.token||o.scene)&&!this.token)this.setData({error:'邀请码无效，请重新扫码'});this.cid=o.course||null;this.setData({course:S.courses.find(c=>c.id===this.cid)||null});},onShow(){this.visible=true;this.setData({loggedIn:!!A.user()});if(A.user())this.refresh();},onHide(){this.visible=false;clearTimeout(this.pollTimer);this.closeCode();},onUnload(){this.visible=false;clearTimeout(this.pollTimer);this.closeCode();},login(){go('account');},async task(fn){if(this.data.busy)return;this.setData({busy:true,error:''});try{await fn();}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},async refresh(){if(!A.user())return;clearTimeout(this.pollTimer);try{if(this.token&&!this.aid){const invitation=await A.call('invitation',{token:this.token});if(invitation.competition){wx.redirectTo({url:'/packages/competition/index?token='+this.token});return;}const seats=invitation.seats||[];this.setData({invitation,seatId:seats.some(seat=>seat.id==='+')?'+':''});}else if(this.aid){const a=await A.call('get',{activityId:this.aid}),mine=a.groups.find(g=>g.id===this.gid&&g.canScore)||a.groups.find(g=>g.memberUids.includes(A.user().uid)||(g.scorerUids||[]).includes(A.user().uid));this.setData({activity:{...a,updatedLabel:new Date(a.updatedAt).toLocaleTimeString()},mine:mine||null,own:mine?.ownerUid===A.user().uid,activityOwner:a.ownerUid===A.user().uid});if(this.visible)this.pollTimer=setTimeout(()=>this.refresh(),15000);}else this.setData({activities:await require('../../services/cloud-history').all('list')});}catch(e){this.setData({error:e.message});}},create(){if(!A.needLogin())return;if(!this.cid)return go('create','?fresh=1');go('create','?course='+encodeURIComponent(this.cid));},selectSeat(e){this.setData({seatId:e.currentTarget.dataset.id});},join(){
 if(!A.needLogin())return;
 this.task(async()=>{
  let joined;
  try {joined=await A.call('join',{token:this.token,seatId:this.data.seatId});}
  catch(error){if(['SEAT_TAKEN','FULL'].includes(error.code))await this.refresh();throw error;}
  this.aid=joined.activityId;this.gid=joined.groupId;
  this.token=null;
  this.setData({invitation:null,hasInvite:false});
  A.friends().catch(()=>{});
  await this.refresh();
  if(joined.live&&this.visible)go('score','?activity='+encodeURIComponent(joined.activityId)+'&group='+encodeURIComponent(joined.groupId));
 });
},
createGroup(){this.task(async()=>{this.groupRequestId ||= S.id();const out=await A.call('createGroup',{activityId:this.aid,groupId:this.groupRequestId});this.groupRequestId=null;this.gid=out.groupId;await this.refresh();});},selectGroup(e){this.gid=e.currentTarget.dataset.id;this.refresh();},open(e){this.gid=null;this.aid=e.currentTarget.dataset.id;this.setData({invite:null,qrcode:''});this.refresh();},list(){this.aid=null;this.setData({activity:null,mine:null,invite:null,qrcode:''});this.refresh();},scan(){if(!wx.scanCode)return this.setData({error:'请在微信中扫码加入'});wx.scanCode({onlyFromCamera:false,success:r=>{const match=(r.path||r.result||'').match(/(?:scene|token)=([a-f0-9]{24})(?:&|$)/);if(!match)return this.setData({error:'请扫描青野小组的小程序码'});this.token=match[1];this.aid=null;this.setData({activity:null,invitation:null,hasInvite:true});if(A.user())this.refresh();else this.login();},fail:()=>{}});},invite(e){return this.task(async()=>{
 const request=this.codeRequest=(this.codeRequest||0)+1,kind=e.currentTarget.dataset.kind;
 this.setData({codeOpen:true,codeKind:kind,codeBusy:true,codeError:'',qrcode:'',invite:null,codeVersion:require('../../services/invite-code').versionLabel()});
 try{
  const inv=await A.call('invite',{activityId:this.aid,groupId:this.data.mine.id,kind});
  if(request!==this.codeRequest||!this.data.codeOpen)return;
  this.setData({invite:{...inv,label:kind==='scorer'?'邀请记分员 / 球童':kind==='join'||kind==='live'?'邀请好友加入本组':kind==='group'?'邀请另一组加入活动':'邀请查看本活动成绩'}});
  await this.qr();
 }catch(error){if(request===this.codeRequest)this.setData({codeError:error.message,codeBusy:false});}
});},
async qr(){
 if(this.loadingCode||!this.data.invite)return;
 const token=this.data.invite.token,request=this.codeRequest;this.loadingCode=true;this.setData({codeBusy:true,codeError:''});
 try{
  const url=await require('../../services/invite-code').generate(token);
  if(request===this.codeRequest&&this.data.codeOpen&&this.data.invite?.token===token)this.setData({qrcode:url});
 }catch(error){if(request===this.codeRequest){this.setData({codeError:error.message});if(error.code==='EXPIRED')this.setData({invite:null});}}
 finally{this.loadingCode=false;if(request===this.codeRequest)this.setData({codeBusy:false});}
},
retryCode(){return this.data.invite?this.qr():this.invite({currentTarget:{dataset:{kind:this.data.codeKind}}});},
closeCode(){this.codeRequest=(this.codeRequest||0)+1;this.setData({codeOpen:false,invite:null,qrcode:'',codeBusy:false,codeError:''});},
codeNoop(){},codeImageError(){this.setData({qrcode:'',codeError:'小程序码图片加载失败，请重试'});},previewCode(){if(this.data.qrcode)wx.previewImage({urls:[this.data.qrcode]});},
revoke(){this.task(async()=>{await A.call('revoke',{token:this.data.invite.token});this.closeCode();});},onShareAppMessage(){const inv=this.data.invite;return inv?{title:'青野 · '+inv.label,path:'/pages/groups/index?token='+inv.token,imageUrl:B.display().src||B.FALLBACK}:{title:'在青野，和球友一起打球',path:'/pages/home/index',imageUrl:B.display().src||B.FALLBACK};},start(){const g=this.data.mine;if(g?.live){const local=S.getRound(g.round.id);if(g.ownerUid===A.user()?.uid&&local?.cloud?.live)return go('score','?id='+encodeURIComponent(g.round.id));return go('score','?activity='+encodeURIComponent(this.data.activity.id)+'&group='+encodeURIComponent(g.id));}if(!g?.canScore)return;if(!g.round)return go('create','?course='+encodeURIComponent(this.data.activity.courseId)+'&activity='+this.aid+'&group='+g.id);const local=S.getRound(g.round.id);if(!local){const r={...g.round,cloud:{activityId:this.aid,groupId:g.id,ownerUid:A.user().uid,serverVersion:g.version},changeLog:[],operations:[],corrections:[]};S.mutate(d=>d.rounds.unshift(r));}go('score','?id='+g.round.id);},retrySync(){this.task(async()=>{await Sync.flush();await this.refresh();});}});
