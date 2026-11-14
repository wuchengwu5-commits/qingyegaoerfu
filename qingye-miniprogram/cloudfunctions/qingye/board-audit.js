const crypto=require('crypto'),{changes}=require('./lib/round-archive');
const key=(activityId,groupId,version)=>'audit-'+crypto.createHash('sha256').update(JSON.stringify([activityId,groupId,version])).digest('hex');
async function write(tx,activity,group,before,after,actor,at,reason){
 const fields=r=>({players:r.players,scores:r.scores,events:r.events||[],awards:r.awards||[],ruleSnapshot:r.ruleSnapshot,status:r.status});
 const delta=changes(fields(before),fields(after));if(!delta.length)return;
 await tx.set('qy_activities',key(activity.id,group.id,group.version),{kind:'score-audit',activityId:activity.id,groupId:group.id,version:group.version,actor,at,reason:reason||'逐洞记分',changes:delta});
}
async function read(repo,activity,group,cursor){
 let n=cursor==null?group.version:Number(cursor);if(!Number.isInteger(n)||n<0||n>group.version)throw Object.assign(Error('修改记录分页无效'),{code:'INVALID'});
 const items=[],stop=Math.max(0,n-30);for(;n>stop;n--){const row=await repo.get('qy_activities',key(activity.id,group.id,n));if(row)items.push(row);}
 return {items,nextCursor:n>0?n:null};
}
module.exports={write,read};
