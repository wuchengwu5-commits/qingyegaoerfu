const Account = require('./account');
const Store = require('./store');
const Sync = require('./cloud-sync');
const Shared = require('./shared-round');
const Queue = require('./score-edit-queue');
const Rules = require('./rules');

function message(error) { return error.message || '连接失败，请重试'; }

module.exports = {
  setupBoard(options) {
    if (options.activity && options.group) this.remoteRef = {activityId:options.activity,groupId:options.group};
    this.setData({remoteBoard:!!this.remoteRef});
  },
  ref() { return this.remoteRef || Store.getRound(this.rid)?.cloud; },
  viewedRound() {
    const r=this.remoteRef ? this.remoteRound : Store.getRound(this.rid);
    const ref=this.remoteRef||r?.cloud;
    return ref && Account.user() && !Store.isEditing(this.rid) ? Queue.overlay(r,Queue.read(Shared.pendingKey(ref))) : r;
  },
  pendingCells() {const ref=this.ref();return ref && Account.user()?Queue.read(Shared.pendingKey(ref)):[];},
  updatePending() {if(this.boardVisible)this.setData({pendingCellCount:this.pendingCells().length,cellBusy:!!this.writing});},
  showBoard() {
    this.boardVisible = true;
    this.setData({joiningBusy:!!this.opening,cellBusy:!!this.writing});
    this.updatePending();
    if(this.remoteRef && (!Account.user() || this.remoteUid!==Account.user().uid)){
      this.remoteRound=null;
      this.boardVersion=undefined;
      this.cellStamps={};
      this.setData({r:null});
    }
    const local = this.remoteRef ? null : Store.getRound(this.rid);
    if (!this.remoteRef && !local?.cloud?.live) {
      if (local && Account.user() && !Store.isEditing(local.id) && (local.cloud || local.players.some(p=>p.id!=='me' && p.accountUid))) this.enableSharing(false);
      return;
    }
    this.watchBoard();
  },
  watchBoard() {
    clearInterval(this.boardTimer);
    if (!this.boardVisible) return;
    this.pollBoard();
    this.boardTimer = setInterval(()=>this.pollBoard(),5000);
    if (this.boardTimer?.unref) this.boardTimer.unref();
  },
  hideBoard() { this.boardVisible=false; clearInterval(this.boardTimer); if(this.data.codeOpen)this.closeCode(); },
  inviteScorer(){return this.enableSharing(true,'scorer');},
  async enableSharing(showCode=true,kind='live') {
    if (this.opening || !Account.needLogin()) return;
    this.opening=true;
    const request=showCode?(this.codeRequest=(this.codeRequest||0)+1):null;
    this.setData({joiningBusy:true,boardError:'',...(showCode?{codeOpen:true,codeKind:kind,codeBusy:true,codeError:'',boardInvite:null,boardCode:'',codeVersion:require('./invite-code').versionLabel()}: {})});
    try {
      const ref = this.remoteRef || await Shared.enable(Store.getRound(this.rid));
      if(ref.routeEditingSupported)this.routeEditingSupported=true;
      if (!this.boardVisible) return;
      this.refresh();
      this.watchBoard();
      if (showCode) {
        const invite = this.cachedInvite?.kind===kind&&this.cachedInvite.expiresAt>Date.now()?this.cachedInvite:await Account.call('invite',{...Shared.context(ref),kind});
        this.cachedInvite=invite;
        if (!this.boardVisible || !this.data.codeOpen || request!==this.codeRequest) return;
        this.setData({boardInvite:invite,boardCode:'',codeError:''});
        await this.loadCode();
      }
    } catch (e) { if(this.boardVisible)this.setData(showCode&&request===this.codeRequest&&this.data.codeOpen?{codeError:message(e),codeBusy:false}:{boardError:message(e)}); }
    finally { this.opening=false; if(this.boardVisible)this.setData({joiningBusy:false}); }
  },
  async loadCode() {
    if(this.loadingCode || !this.data.boardInvite)return;
    const token=this.data.boardInvite.token,request=this.codeRequest;
    this.loadingCode=true;this.setData({codeBusy:true,codeError:''});
    const current=()=>this.data.codeOpen&&request===this.codeRequest&&this.data.boardInvite?.token===token;
    try {
      const url=await require('./invite-code').generate(token);
      if(current())this.setData({boardCode:url});
    } catch(e) {
      if(current()){
        this.setData({codeError:message(e)});
        if(e.code==='EXPIRED'){this.cachedInvite=null;this.setData({boardInvite:null});}
      }
    } finally {this.loadingCode=false;if(request===this.codeRequest)this.setData({codeBusy:false});}
  },
  retryCode(){return this.data.boardInvite?this.loadCode():this.enableSharing(true,this.data.codeKind||'live');},
  codeNoop(){},
  retryBoard(){return this.data.liveBoard?this.pollBoard():this.enableSharing();},
  async revokeCode(){
    const invite=this.data.boardInvite;
    if(!invite||this.revoking)return;
    this.revoking=true;
    try{
      await Account.call('revoke',{token:invite.token});
      this.cachedInvite=null;
      this.closeCode();
      wx.showToast({title:'本次邀请已撤销',icon:'success'});
    }catch(e){this.setData({codeError:message(e)});}
    finally{this.revoking=false;}
  },
  closeCode(){this.codeRequest=(this.codeRequest||0)+1;this.setData({codeOpen:false,boardInvite:null,boardCode:'',codeError:'',codeBusy:false});},
  codeImageError(){this.setData({boardCode:'',codeError:'邀请码图片加载失败，请重试'});},
  previewCode(){if(this.data.boardCode)wx.previewImage({urls:[this.data.boardCode]});},
  onShareAppMessage(){
    const invitation=this.data.boardInvite;
    return invitation ? {title:this.data.r.courseName+(invitation.kind==='scorer'?' · 邀请你担任记分员':' · 加入同组记分'),path:'/pages/groups/index?token='+invitation.token}
      : {title:'青野高尔夫',path:'/pages/home/index'};
  },
  boardSettled(){
    if(!this.data.liveBoard&&!this.opening)return true;
    if(this.opening||this.writing||!Account.user()||wx.getStorageSync(Shared.pendingKey(this.ref()))||wx.getStorageSync(this.virtualKey(this.ref()))){
      wx.showToast({title:'请先完成当前记分同步',icon:'none'});
      return false;
    }
    return true;
  },
  boardLogin(){Account.needLogin();},
  showSnapshot(board) {
    if(board?.ownerUid)this.boardOwnerUid=board.ownerUid;
    if(board?.primaryScorerUid)this.primaryScorerUid=board.primaryScorerUid;
    if(board?.competition){
      this.competitionBoard=true;
      if(board.readOnly!==undefined)this.boardReadOnly=board.readOnly;
      this.lockedPlayers=board.lockedPlayers||[];
    }
    if(board?.routeEditingSupported)this.routeEditingSupported=true;
    if(board?.profiles)this.boardProfiles=board.profiles;
    if(board?.scorerUids)this.boardScorerUids=board.scorerUids;
    if(board?.rosterEditingSupported)this.rosterEditingSupported=true;
    if(!board?.round || !this.boardVisible)return;
    if(this.remoteRef){
      if(this.boardVersion>board.version)return;
      const prior=this.remoteRound;
      const mine=board.round.players.find(p=>p.accountUid===Account.user()?.uid);
      const physicalHole=prior?.holes.find(h=>h.number===prior.currentHole)?.id;
      const cursor=physicalHole?board.round.holes.find(h=>h.id===physicalHole)?.number:null;
      if(prior && prior.courseSnapshot?.routeRevision!==board.round.courseSnapshot?.routeRevision)this.lastCell=null;
      this.remoteRound={...board.round,currentHole:cursor||board.round.currentHole,
        currentPlayer:prior?.currentPlayer||mine?.id||board.round.currentPlayer};
      this.remoteUid=Account.user()?.uid;
      this.cellStamps=board.cells;
      this.boardVersion=board.version;
      this.rid=board.round.id;
    }else if(!Shared.adopt(board))return;
    this.refresh();
  },
  async pollBoard() {
    if(!this.boardVisible || this.pulling || this.writing || (!this.remoteRef && Store.isEditing(this.rid)))return;
    const ref=this.ref();
    if(!ref)return;
    const user=Account.user();
    this.setData({boardLoginNeeded:!user});
    if(!user)return;
    if(wx.getStorageSync(this.virtualKey(ref))){await this.submitVirtual(ref);return;}
    this.pulling=true;
    try{
      const queued=Queue.read(Shared.pendingKey(ref));
      if(queued.length){await this.submitCell(ref);return;}
      if(!this.remoteRef && Sync.pending(this.rid)){
        if(Sync.pending(this.rid).errorCode!=='CONFLICT')await Sync.flush();
        const pending=Sync.pending(this.rid);
        if(pending){
          this.setData({boardError:Sync.status(this.rid),boardConflict:pending.errorCode==='CONFLICT'});
          return;
        }
      }
      const localRound=this.remoteRef?null:Store.getRound(this.rid);
      // A whole-round route save advances the version; fetch its new cell stamps
      // before accepting more scores, even when the server data is already local.
      const version=this.remoteRef?this.boardVersion:localRound?.cloud?.serverVersion;
      const board=await Account.call('readBoard',{...Shared.context(ref),version,includeProfiles:!this.boardProfiles});
      if(this.boardVisible && Account.user()?.uid===user.uid){
        this.showSnapshot(board);
        if((board.profiles||board.scorerUids)&&!board.round)this.refresh();
        this.setData({boardError:'',boardConflict:false});
      }
    }catch(e){if(this.boardVisible)this.setData({boardError:message(e)});}
    finally{this.pulling=false;}
  },
  cellTarget(){
    const r=this.viewedRound(),playerId=this.data.p.id,hole=this.data.h.number;
    const cells=this.remoteRef?this.cellStamps:r.cloud?.cells;
    return {roundId:r.id,playerId,hole,cellVersion:cells?.[playerId+':'+hole]?.version||0,
      routeRevision:r.courseSnapshot?.routeRevision||0,physicalHoleId:r.holes.find(h=>h.number===hole)?.id};
  },
  async writeCell(score,target) {
    if(this.boardReadOnly||this.lockedPlayers?.includes(target.playerId))return;
    if(this.opening||!Account.needLogin())return;
    const ref=this.ref(),key=Shared.pendingKey(ref);
    if(!this.remoteRef && Sync.pending(this.rid))return wx.showToast({title:'请先同步上一笔球局修改',icon:'none'});
    try {
      Rules.validateScore(score);
      const r=this.viewedRound();
      if(!r.scores[target.playerId] || !r.holes.some(h=>h.number===target.hole && (!target.physicalHoleId||h.id===target.physicalHoleId)))throw Error('球洞已调整，请重新选择');
      const request={...Shared.context(ref),...target,score:Rules.normalizeScore(score),mutationId:Store.id()};
      const entries=Queue.read(key);
      entries.push({request,before:r.scores[target.playerId][target.hole]||null});
      // Persist the intent before displaying it. Network calls run independently of taps.
      Queue.save(key,entries);
      this.refresh(Queue.overlay(r,[entries[entries.length-1]]));
      this.updatePending();
    }catch(e){this.setData({boardError:message(e)});return;}
    return this.submitCell(ref);
  },
  async submitCell(ref){
    if(this.writing||!Account.user())return;
    this.writing=true;
    const uid=Account.user().uid,key=Shared.pendingKey(ref);
    this.updatePending();
    try{
      while(Account.user()?.uid===uid){
        const entries=Queue.read(key),queued=entries[0];if(!queued)break;
        const req=queued.request;
        try{
          queued.sent=true;Queue.save(key,entries);
          const board=await Account.call('scoreCell',req);
          if(Account.user()?.uid!==uid)break;
          // Keep the request for an idempotent retry if storing the reply fails.
          if(this.boardVisible)this.showSnapshot(board);
          else if(!this.remoteRef)Shared.adopt(board);
          const stamp=board.cells[req.playerId+':'+req.hole];
          Queue.acknowledge(key,req,stamp.version);
          this.lastCell={...req,cellVersion:stamp.version,before:queued.before};
          if(this.boardVisible){this.refresh();this.setData({boardError:''});this.updatePending();}
        }catch(e){
          if(Account.user()?.uid!==uid)break;
          const definitive=['CELL_CONFLICT','CLOSED','FORBIDDEN','INVALID','INVALID_SCORE','CONCESSION_SCOPE'].includes(e.code);
          if(definitive)Queue.reject(key,req,['CLOSED','FORBIDDEN'].includes(e.code));
          if(this.boardVisible){
            this.setData({boardError:definitive?message(e):'本机已记，联网后继续同步'});
            if(definitive){
              wx.showToast({title:message(e),icon:'none',duration:3500});
              try{this.showSnapshot(await Account.call('readBoard',Shared.context(ref)));}catch(_){}
              this.refresh();
            }
          }
          // A failed acknowledgement may have reached the server. Replay its same ID later.
          break;
        }
      }
    }finally{this.writing=false;this.updatePending();}
  },
  undoCell(){
    const ref=this.ref(),entries=this.pendingCells(),last=entries[entries.length-1];
    if(last){
      if(!last.sent){
        try{Queue.save(Shared.pendingKey(ref),entries.slice(0,-1));this.refresh();this.updatePending();}
        catch(e){this.setData({boardError:'未能撤销，请重试'});}
        return;
      }
      return this.writeCell(last.before,last.request);
    }
    const saved=this.lastCell;
    if(!saved)return wx.showToast({title:'没有可撤销的本机录入',icon:'none'});
    return this.writeCell(saved.before,{roundId:saved.roundId,playerId:saved.playerId,hole:saved.hole,cellVersion:saved.cellVersion,
      routeRevision:saved.routeRevision,physicalHoleId:saved.physicalHoleId});
  },
  virtualKey(ref){return 'qingye.virtualSeat.'+Account.user()?.uid+'.'+ref.activityId+'.'+ref.groupId;},
  addVirtual(){
    if(!this.data.canInvite||this.data.editing||this.data.boardFinished)return;
    if(this.data.liveBoard){const ref=this.ref();if(Account.user()&&wx.getStorageSync(this.virtualKey(ref)))return this.submitVirtual(ref);}
    if(!this.boardSettled())return;
    const r=this.viewedRound(),Roster=require('./score-roster');
    if(r.cloud&&!r.cloud.live)return wx.showToast({title:'请先联网开启共同记分，再添加球友',icon:'none'});
    if(!Roster.canAdd(r))return wx.showToast({title:r.players.length>=Rules.GROUP_MAX_PLAYERS?'每组最多 16 人，请新建另一组':'本场玩法人数固定，请新建另一组',icon:'none'});
    wx.showModal({title:'添加手动球员',editable:true,placeholderText:'输入昵称',content:'球友'+(r.players.length+1),success:result=>{
      if(!result.confirm)return;
      try{
        const name=(result.content||'').trim(),current=this.viewedRound(),id='virtual-'+Store.id();
        const next=Roster.append(current,{id,name});
        if(this.data.liveBoard){
          if(!Account.needLogin()||!this.boardSettled())return;
          const ref=this.ref();wx.setStorageSync(this.virtualKey(ref),{playerId:id,name});this.submitVirtual(ref);
        }else{Store.replace(next);this.lastCell=null;this.refresh(next);wx.showToast({title:'球友已添加',icon:'success'});}
      }catch(e){wx.showToast({title:message(e),icon:'none'});}
    }});
  },
  async submitVirtual(ref){
    if(this.opening||this.writing||!Account.user())return;
    const key=this.virtualKey(ref),request=wx.getStorageSync(key),uid=Account.user().uid;if(!request)return;
    this.opening=true;this.setData({joiningBusy:true});
    try{
      const board=await Account.call('addVirtualPlayer',{...Shared.context(ref),...request});
      if(Account.user()?.uid!==uid)return;
      if(this.boardVisible)this.showSnapshot(board);else if(!this.remoteRef)Shared.adopt(board);
      wx.setStorageSync(key,null);this.lastCell=null;if(this.boardVisible)this.setData({boardError:''});
    }catch(e){
      if(['INVALID','FORBIDDEN','CLOSED'].includes(e.code))wx.setStorageSync(key,null);
      if(this.boardVisible)this.setData({boardError:['INVALID','FORBIDDEN','CLOSED'].includes(e.code)?message(e):'球友添加待确认，联网后重试'});
    }finally{this.opening=false;if(this.boardVisible)this.setData({joiningBusy:false});}
  },
  async changePrimary(e){
    const scorerId=this.data.scorerChoices[Number(e.detail.value)]?.id;
    if(!scorerId||!this.boardSettled())return;
    try{if(!this.ref()?.live&&!this.remoteRef)await this.enableSharing(false);const ref=this.ref();if(ref)this.showSnapshot(await Account.call('primaryScorer',{...Shared.context(ref),scorerId}));}
    catch(error){this.setData({boardError:message(error)});}
  },
  finishRemote(){
    if(!this.data.canFinishRemote||!this.boardSettled())return;
    const version=this.boardVersion;
    wx.showModal({title:'检查并结束本轮',content:'未记球洞会保留空白。结束后，全组停止录入。',success:async result=>{
      if(!result.confirm)return;
      try{this.showSnapshot(await Account.call('finishBoard',{...Shared.context(this.ref()),version}));}
      catch(error){this.setData({boardError:message(error)});}
    }});
  },
  removeScorer(e){
    if(!this.data.canInvite)return;
    const uid=e.currentTarget.dataset.uid;
    wx.showModal({title:'移除记分员',content:'移除后，对方将不能继续编辑本组成绩。',success:async result=>{
      if(!result.confirm)return;
      try{this.showSnapshot(await Account.call('removeScorer',{...Shared.context(this.ref()),uid}));}
      catch(error){this.setData({boardError:message(error)});}
    }});
  },
  switchGroups(){
    if(this.competitionBoard){
      const activity=this.remoteRef?.activityId;
      wx.navigateTo({url:'/packages/competition/index?id='+encodeURIComponent(activity)+'&group='+encodeURIComponent(this.remoteRef?.groupId||'')});
      return;
    }
    wx.switchTab({url:'/pages/play/index'});
  },
  resolveBoard(){
    const item=Sync.pending(this.rid);
    if(!item || item.errorCode!=='CONFLICT')return this.pollBoard();
    wx.showModal({title:'同步同组成绩',content:'将当前记录另存为本机副本，然后载入组内最新记分牌。',confirmText:'保留并刷新',success:async res=>{
      if(!res.confirm)return;
      try{
        const board=await Account.call('readBoard',Shared.context(this.ref()));
        Sync.keepConflictCopy(this.rid,item.stamp);
        this.showSnapshot(board);
        this.setData({boardConflict:false,boardError:''});
      }catch(e){this.setData({boardError:message(e)});}
    }});
  },
  moveCursor(changes){
    if(this.remoteRef)Object.assign(this.remoteRound,changes);
    else if(this.data.liveBoard && !Store.isEditing(this.rid))Store.mutate(d=>Object.assign(d.rounds.find(r=>r.id===this.rid),changes));
    else {const r=Store.getRound(this.rid);Object.assign(r,changes);Store.replace(r);}
  }
};

