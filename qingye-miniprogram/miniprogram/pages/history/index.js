const {S,run,go,tab,confirm}=require('../../services/ui');
const E=require('../../services/engine');
Page({
 data:{filters:[{id:'all',label:'全部'},{id:'active',label:'进行中'},{id:'paused',label:'已暂存'},{id:'finished',label:'已完成'}],filter:'all',query:'',items:[]},
 onLoad(o={}){if(this.data.filters.some(f=>f.id===o.filter))this.setData({filter:o.filter});},
 onShow(){this.refresh();},
 refresh(){run(()=>this.setData({items:S.read().rounds.filter(r=>(this.data.filter==='all'||(this.data.filter==='finished'?E.isFinished(r):r.status===this.data.filter))&&r.courseName.includes(this.data.query.trim())).map(r=>Object.assign({},r,E.summary(r,'me'),{date:S.date(r.createdAt)}))}));},
 filter(e){this.setData({filter:e.currentTarget.dataset.id});this.refresh();},
 search(e){this.setData({query:e.detail.value});this.refresh();},
 open(e){run(()=>{const r=S.getRound(e.currentTarget.dataset.id);if(!r)throw Error('球局不存在');if(r.status==='paused')return this.resume(r.id);go(r.status==='active'?'score':'result','?id='+r.id);});},
 resume(id){
  const active=S.active();
  const done=()=>run(()=>{
   const r=S.getRound(id);if(!r||r.status!=='paused')throw Error('这场球的状态已变化，请重新打开');
   const current=S.active();if(current&&current.id!==id){current.status='paused';S.replace(current);}
   r.status='active';S.replace(r);go('score','?id='+id);
  });
  if(active&&active.id!==id)confirm('继续这场球','当前进行中的球局将暂存，已记成绩会保留。',done);else done();
 },
 remove(e){const id=e.currentTarget.dataset.id;confirm('删除球局','删除后无法恢复，是否删除本机这条球局记录？',()=>{S.mutate(d=>d.rounds=d.rounds.filter(r=>r.id!==id));this.refresh();});},
 home(){tab('courses');}
});
