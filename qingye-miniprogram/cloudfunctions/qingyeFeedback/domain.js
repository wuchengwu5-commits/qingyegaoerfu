const crypto = require('crypto');
const CATEGORIES = ['体验建议', '功能异常', '球场资料纠错', '版权与合作'];
const STATUS = {new:'待确认', confirmed:'已确认', fixing:'修复中', ready:'待发布', resolved:'已解决', need_info:'待补充', declined:'暂不处理'};
const TRANSITIONS = {
  new:['confirmed','need_info','declined'], need_info:['confirmed','declined'],
  confirmed:['fixing','need_info','declined'], fixing:['ready','need_info'],
  ready:['resolved','fixing','need_info'], resolved:[], declined:['confirmed','need_info']
};
function fail(code,message){throw Object.assign(Error(message),{code});}
function str(value,max,min=0){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail('INPUT','请检查填写内容的长度');return value.trim();}
function hash(s){return crypto.createHash('sha256').update(s).digest('hex');}
function ownerFor(openid,appid){return hash(appid+':'+openid).slice(0,40);}
function publicItem(x){return {id:x.id,category:x.category,content:x.content,status:x.status,reply:x.reply||'',created:x.created,updated:x.updated,replyAt:x.replyAt||0,releaseVersion:x.status==='resolved'?x.releaseVersion:''};}
function adminItem(x){return {...publicItem(x),contact:x.contact,note:x.note||'',version:x.version,verification:x.verification||'',releaseVersion:x.releaseVersion||'',approvedAt:x.approvedAt||0};}
function createService(repo,now=Date.now){
  async function isAdmin(owner,r=repo){const row=await r.get('qy_feedback_admins',owner);return row?.enabled===true&&!row._openid;}
  async function accepting(){const row=await repo.get('qy_feedback_admins','intake');return row?.enabled===true&&!row._openid;}
  async function dispatch(owner,event={}){
    if(!/^[a-f0-9]{40}$/.test(owner))fail('AUTH','请从青野小程序访问');
    const action=event.action;
    if(action==='access')return {isAdmin:await isAdmin(owner),ownerKey:owner,accepting:await accepting()};
    if(action==='submit'){
      if(!await accepting())fail('NOT_READY','反馈收件服务正在准备，草稿已保存，请稍后重试');
      const category=str(event.category,20),content=str(event.content,2000,5),contact=str(event.contact||'',120);
      if(!CATEGORIES.includes(category))fail('INPUT','请选择反馈类型');
      const requestId=str(event.requestId,64,32);if(!/^[a-f0-9]{32,64}$/.test(requestId))fail('INPUT','提交凭据无效，请重试');
      const id='fb_'+hash(owner+':'+requestId).slice(0,40),fingerprint=hash(JSON.stringify([category,content,contact]));
      return repo.transaction(async tx=>{
        const existing=await tx.get('qy_feedback',id);
        if(existing){if(existing.fingerprint!==fingerprint)fail('CONFLICT','之前的提交已经收到，请在我的反馈查看后再提交新问题');return publicItem(existing);}
        const time=now(),day=Math.floor(time/86400000),limitId=owner+'_'+day,limit=await tx.get('qy_feedback_limits',limitId);
        if((limit?.count||0)>=20)fail('RATE_LIMIT','今天提交较多，请稍后再试或电话联系');
        const row={id,owner,category,content,contact,fingerprint,status:'new',reply:'',created:time,updated:time,version:1};
        await tx.set('qy_feedback_limits',limitId,{count:(limit?.count||0)+1,day});
        await tx.set('qy_feedback',id,row);return publicItem(row);
      });
    }
    if(action==='mine'||action==='list'){
      const admin=action==='list';if(admin&&!await isAdmin(owner))fail('FORBIDDEN','仅管理员可查看客户反馈');
      const cursor=event.cursor||'';if(cursor&&!/^fb_[a-f0-9]{40}$/.test(cursor))fail('INPUT','分页凭据无效');
      const rows=await repo.list(admin?{}:{owner},cursor,51),more=rows.length>50,items=rows.slice(0,50);
      return {items:items.map(admin?adminItem:publicItem),nextCursor:more?items[items.length-1].id:''};
    }
    if(action==='update'){
      const id=str(event.id,43);if(!/^fb_[a-f0-9]{40}$/.test(id))fail('INPUT','反馈编号无效');
      const op=str(event.operationId,64,32);if(!/^[a-f0-9]{32,64}$/.test(op))fail('INPUT','操作凭据无效');
      const status=str(event.status,20),reply=str(event.reply||'',2000),note=str(event.note||'',2000),releaseVersion=str(event.releaseVersion||'',80),verification=str(event.verification||'',1000);
      if(!STATUS[status]||!Number.isInteger(event.version))fail('INPUT','处理状态无效');
      const fingerprint=hash(JSON.stringify([id,status,reply,note,releaseVersion,verification,event.version]));
      return repo.transaction(async tx=>{
        if(!await isAdmin(owner,tx))fail('FORBIDDEN','仅管理员可处理客户反馈');
        const opId=hash(owner+':'+op),previous=await tx.get('qy_feedback_events',opId),row=await tx.get('qy_feedback',id);
        if(!row)fail('NOT_FOUND','反馈不存在');
        if(previous){if(previous.fingerprint!==fingerprint)fail('CONFLICT','操作凭据已被使用，请刷新后重试');return adminItem(row);}
        if(row.version!==event.version)fail('CONFLICT','反馈已被更新，请刷新后再处理');
        if(row.status!==status&&!TRANSITIONS[row.status]?.includes(status))fail('TRANSITION','请先确认问题，再依次修复、验证和发布');
        if(status==='resolved'&&(!row.approvedAt||!releaseVersion||!verification||!reply))fail('RELEASE_REQUIRED','请填写已发布版本、验证结果和客户回复后再标记已解决');
        const time=now(),updated={...row,status,reply,note,releaseVersion,verification,updated:time,version:row.version+1};
        if(status==='confirmed'&&!row.approvedAt){updated.approvedAt=time;updated.approvedBy=owner;}
        if(reply&&reply!==row.reply)updated.replyAt=time;
        await tx.set('qy_feedback',id,updated);
        await tx.set('qy_feedback_events',opId,{id,actor:owner,fingerprint,from:row.status,to:status,reply,replyChanged:reply!==row.reply,created:time,version:updated.version});
        return adminItem(updated);
      });
    }
    fail('ACTION','不支持的反馈操作');
  }
  return {dispatch};
}
module.exports={createService,ownerFor,STATUS,TRANSITIONS};
