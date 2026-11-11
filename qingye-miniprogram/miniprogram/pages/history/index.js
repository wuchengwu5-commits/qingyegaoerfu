const {S,run,go,tab,confirm}=require('../../services/ui');
const A=require('../../services/account'),H=require('../../services/round-history');
Page({
 data:{filters:[{id:'all',label:'全部球局'},{id:'active',label:'进行中'},{id:'finished',label:'已结束'}],filter:'all',query:'',items:[],backups:[],showBackups:false,cloudError:''},
 onLoad(o={}){if(this.data.filters.some(f=>f.id===o.filter))this.setData({filter:o.filter});},
 onShow(){this.visible=true;this.refresh();this.loadCloud();},onHide(){this.visible=false;},onUnload(){this.visible=false;},
 refresh(){run(()=>{const all=H.select(H.merge(H.local(S.read().rounds),this.remote||[]),this.data.filter,this.data.query),labels={draft:'待开局',active:'进行中',paused:'可继续',finished_complete:'已完成',finished_incomplete:'部分完成'};const rows=all.map(r=>({...r,state:labels[r.status]||'已结束',type:r.kind==='competition'?'比赛':r.kind==='group'?'线上球局':'球局'}));this.rows=rows;this.setData({items:rows.filter(r=>!r.backup),backups:rows.filter(r=>r.backup)});});},
 async loadCloud(){const uid=A.user()?.uid;if(!uid){this.remote=[];this.setData({cloudError:''});this.refresh();return;}const request=this.request=(this.request||0)+1;const results=await Promise.allSettled([A.call('list'),A.call('competitionList')]);if(!this.visible||request!==this.request||A.user()?.uid!==uid)return;this.remote=H.cloud(results[0].status==='fulfilled'?results[0].value:[],results[1].status==='fulfilled'?results[1].value:[]);this.setData({cloudError:results.some(r=>r.status==='rejected')?'部分线上球局暂未更新，点击重试':''});this.refresh();},
 filter(e){this.setData({filter:e.currentTarget.dataset.id});this.refresh();},search(e){this.setData({query:e.detail.value});this.refresh();},
 backups(){this.setData({showBackups:!this.data.showBackups});},
 open(e){const item=this.rows?.find(r=>r.key===e.currentTarget.dataset.id);if(!item)return;if(item.kind==='competition')return wx.navigateTo({url:'/packages/competition/index?id='+encodeURIComponent(item.id)});if(item.kind==='group')return item.roundId&&item.canScore?go('score','?activity='+encodeURIComponent(item.activityId)+'&group='+encodeURIComponent(item.groupId)):go('groups','?activity='+encodeURIComponent(item.activityId)+'&group='+encodeURIComponent(item.groupId));run(()=>{const r=S.getRound(item.id);if(!r)throw Error('球局不存在');if(r.status==='paused')return this.resume(r.id);go(r.status==='active'?'score':'result','?id='+r.id);});},
 resume(id){run(()=>{const r=S.getRound(id);if(!r||r.status!=='paused')throw Error('这场球的状态已变化，请重新打开');r.status='active';S.replace(r);go('score','?id='+id);});},
 remove(e){const id=e.currentTarget.dataset.id;confirm('删除本机记录','删除后无法恢复，是否删除这条本机记录？',()=>{S.mutate(d=>d.rounds=d.rounds.filter(r=>r.id!==id));this.refresh();});},
 home(){tab('courses');}
});
