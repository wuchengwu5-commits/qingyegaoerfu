const Dialog=require('../../services/dialog');
const {S,run,go,tab,confirm}=require('../../services/ui'),R=require('../../services/rules'),labels=require('../../services/forms').labels;
const Account=require('../../services/account'),Source=require('../../services/round-source');
const Card=require('../../services/full-scorecard');
const scoreFields={grossStrokes:'总杆',strokes:'总杆',putts:'推杆',penalties:'罚杆',fairway:'上球道',green:'标准杆上果岭',completion:'完洞状态',reason:'说明'};
const scoreValue=v=>v==null?'未记录':typeof v==='object'?v.grossStrokes!=null?v.grossStrokes+'杆':scoreValue(v.completion):typeof v==='boolean'?(v?'是':'否'):({holed_out:'已完洞',skipped:'跳洞',picked_up:'捡球',conceded_next_stroke:'认输'}[v]||String(v));
const state={pending:'待录入',in_progress:'进行中',incomplete:'未决',decided:'已结算',tied:'平局',void:'无主赛',unallocated:'有未分配点数'};
Page({
 data:{half:'front',calculation:false,moreActions:false,log:[],ending:false},
 onLoad(o){this.options=o;this.rid=o.id;},
 onShow(){this.visible=true;this.refresh();this.reload();this.timer=setInterval(()=>this.reload(),5000);this.timer?.unref?.();},
 onHide(){this.visible=false;clearInterval(this.timer);},onUnload(){this.onHide();},
 async reload(){
  if(this.loading)return;this.loading=true;const uid=Account.user()?.uid;
  try{const source=await Source.load(this.options);if(!this.visible||Account.user()?.uid!==uid)return;
   this.source=source;this.rid=source.round.id;this.setData({error:''});this.refresh();
   if(source.ref&&this.data.moreActions){try{const key=source.board.version;if(this.logVersion!==key){const logs=[];let cursor=null;do{const p=await Account.call('readBoardHistory',{...source.ref,cursor});logs.push(...p.items);cursor=p.nextCursor;}while(cursor!=null);if(this.visible&&Account.user()?.uid===uid){this.remoteLog=logs;this.logVersion=key;this.setData({historyError:''});this.refresh();}}}catch(e){if(this.visible)this.setData({historyError:'修订记录暂未载入，可稍后重试'});}}
  }catch(e){if(this.visible)this.setData({error:e.message});}finally{this.loading=false;}
 },
 refresh(){run(()=>{
  const local=this.options?.id?S.getRound(this.options.id):null;
  const r=local&&(!this.source||S.isEditing(local.id)||!local.cloud)?local:this.source?.round||local;if(!r)return;
  const out=R.buildRoundSummary(r),name=id=>r.players.find(p=>p.id===id)?.name||R.competitors(r).find(c=>c.id===id)?.name||id;
  const mineId=this.source?this.source.mineId:'me',canEdit=this.source?this.source.canEdit:r.status!=='cancelled';
  const logs=this.remoteLog||(r.changeLog||[]).slice().reverse();
  this.setData({r,date:r.date,mine:mineId?R.rawSummary(r,mineId):null,finished:R.isFinished(r)||r.status==='cancelled',cancelled:r.status==='cancelled',canEdit,editing:S.isEditing(r.id),
   ...Card.build(r,this.data.half,mineId,[...(Account.user()?[Account.user()]:[]),...(this.source?.board?.profiles||[]),...S.displayProfiles()]),
   canFinish:canEdit&&!this.source?.board?.competition&&!S.isEditing(r.id)&&['active','paused'].includes(r.status),
   needsSourceConfirmation:Object.values(r.scores).some(scores=>Object.values(scores).some(s=>s.completionSource==='legacy_assumed')),
   main:{...out.main,title:R.names[r.ruleSnapshot.scoring.type],state:state[out.main.status],winner:out.main.winnerId?name(out.main.winnerId):''},recordOnly:r.ruleSnapshot.scoring.type==='record_only',
   side:out.sideGames.map(g=>({...g,name:labels[g.type],state:state[g.status],totals:Object.entries(g.totals||{}).map(([id,v])=>({id,name:name(id),text:typeof v==='object'?(v.denominator===1?String(v.numerator):v.numerator+'/'+v.denominator):String(v)})),contests:g.contests?.map((c,i)=>({...c,label:['前九','后九','全场'][i],winner:c.winnerId?name(c.winnerId):'',state:state[c.status]}))||[]})),
   players:out.players,
   rows:r.holes.map(h=>({number:h.number,par:h.par,values:r.players.map(p=>{const s=r.scores[p.id][h.number],d=R.derivePlayerHole(r,p.id,h.number,undefined,r.ruleSnapshot.scoring.type==='match_play'?'main':undefined);return {id:p.id,raw:s?.completion==='holed_out'?s.grossStrokes:s?({picked_up:'捡',skipped:'跳',conceded_next_stroke:'认'})[s.completion]:'—',derived:d.value??'—',net:d.net??'—',allowance:d.allowance,explanation:d.explanation};})})),
   log:logs.map(l=>({revision:l.newRevision??l.version,reason:l.reason,date:new Date(l.time||l.at).toLocaleString(),details:(l.changes||[]).filter(c=>c.path[0]==='scores'&&(c.path.length===3||scoreFields[c.path[3]])&&c.path[3]!=='strokes').map(c=>name(c.path[1])+' · '+c.path[2]+'洞 '+(scoreFields[c.path[3]]||'成绩')+' '+scoreValue(c.before)+' → '+scoreValue(c.after)).join('；')}))});
 });},
 playerDetails(){go('players',Source.query(this.options));},
 half(e){this.setData({half:e.currentTarget.dataset.id});this.refresh();},
 toggleActions(){this.setData({moreActions:!this.data.moreActions});if(this.data.moreActions)this.reload();},calculations(){this.setData({calculation:!this.data.calculation});},
 share(){go('share',Source.query(this.options));},
 resume(){if(this.data.editing||require('../../services/round-history').backup(this.data.r||{}))return wx.redirectTo({url:'/pages/score/index'+Source.query(this.options)});require('../../services/score-entry').open(this.options);},
 edit(e){if(this.data.finished||!this.data.canEdit)return;const r=S.getRound(this.rid);if(!r)return this.resume();const {number,pid}=e.currentTarget.dataset;r.currentHole=Number(number);if(r.players.some(p=>p.id===pid))r.currentPlayer=pid;S.replace(r);this.resume();},
 async finish(){
  if(this.data.ending||!this.data.canFinish)return;
  this.setData({ending:true});
  try{if(await require('../../services/end-round')({id:this.rid,...(this.source?.ref||{})})){this.source=null;this.options={id:this.rid};this.remoteLog=null;this.logVersion=null;this.refresh();await this.reload();}}
  catch(e){wx.showToast({title:e.message||'暂未结束，请重试',icon:'none'});}
  finally{if(this.visible)this.setData({ending:false});}
 },
 prepareEdit(){if(!this.data.canEdit)throw Error('只有球局发起人可以更正');if(require('../../services/cloud-sync').pending(this.rid))throw Error('请先同步本机修改，再开始更正');if(this.source?.board&&S.getRound(this.rid))require('../../services/shared-round').adopt(this.source.board);if(!S.getRound(this.rid)){const source=this.source;S.mutate(d=>d.rounds.push({...source.round,ownerUid:Account.user()?.uid,cloud:{...source.ref,ownerUid:source.board.ownerUid,live:true,serverVersion:source.board.version,cells:source.board.cells},changeLog:[],operations:[],corrections:[]}));}S.startEdit(this.rid);this.options={id:this.rid};},
 beginEdit(){if(!this.data.canEdit)return;confirm('进入成绩更正','修改后填写原因再提交；原记录和规则快照保留。',()=>run(()=>{this.prepareEdit();this.resume();}));},
 rules(){if(this.options.id)return go('rules','?id='+this.rid+'&view=1');Dialog.modal({title:'本场规则',content:R.names[this.data.r.ruleSnapshot.scoring.type]+'\n'+(this.data.r.ruleSnapshot.penaltyPolicy.summary||'按开局确认的球场与比赛规则执行'),showCancel:false});},
 reviseRules(){if(!this.data.canEdit)return;confirm('整轮规则更正','重新核对后统一重算本轮结果。',()=>run(()=>{if(this.data.finished)this.prepareEdit();go('rules','?id='+this.rid);}));},
 confirmSources(){if(!this.data.canEdit)return;Dialog.modal({title:'核对旧记录来源',message:'请核对均为实际完洞，并填写核对来源。',editable:true,success:res=>{if(res.confirm)run(()=>{S.operate(this.rid,{type:'confirm_sources',actualConfirmed:true,reason:res.content});this.refresh();});}});},
 hub(){tab('play');},
 copy(){wx.setClipboardData({data:'青野 · '+this.data.r.courseName+'\n'+this.data.date+' · 修订 '+this.data.r.revision+'\n'+this.data.players.map(p=>p.name+' 实际 '+p.totalText+' 杆 · '+p.played+'/'+this.data.r.holes.length+' 洞').join('\n')});},home(){tab('home');}
});
