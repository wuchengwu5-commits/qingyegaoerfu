const Score=require('../../services/score-page'),Entry=require('../../services/score-entry');
const {data,onLoad,onShow,onHide,onUnload,...actions}=Score;
Component({
 options:{styleIsolation:'apply-shared'},
 properties:{target:{type:Object,value:null}},
 data:{...data,embedded:true},
 lifetimes:{
  ready(){this.started=true;onLoad.call(this,this.properties.target||{});onShow.call(this);},
  detached(){if(this.started)onUnload.call(this);this.started=false;}
 },
 pageLifetimes:{show(){if(this.started)onShow.call(this);},hide(){if(this.started)onHide.call(this);}},
 methods:{...actions,
  showRoundList(){this.triggerEvent('hub');},
  refresh(round){
   const r=round||this.viewedRound();
   if(r&&!Entry.active(r)&&!this.correctionOpen){Entry.forget(r.id);this.triggerEvent('closed');return;}
   return actions.refresh.call(this,round);
  },
  pause(){this.triggerEvent('hub');},
  switchGroups(){if(this.competitionBoard)return actions.switchGroups.call(this);this.triggerEvent('hub');},
  finishRemote(){if(this.data.canFinishRemote)return this.finish();},
  async finish(){
   if(this.finishing||!this.boardSettled())return;this.finishing=true;
   try{if(await require('../../services/end-round')({id:this.rid,...(this.remoteRef||{})})){
    Entry.forget(this.rid);this.triggerEvent('closed');wx.navigateTo({url:'/pages/result/index?id='+encodeURIComponent(this.rid)});
   }}catch(e){wx.showToast({title:e.message,icon:'none'});}finally{this.finishing=false;}
  }
 }
});
