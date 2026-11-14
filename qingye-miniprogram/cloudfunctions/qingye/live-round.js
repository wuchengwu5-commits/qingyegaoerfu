const crypto = require('crypto');
const rules = require('./lib/rules');
const Audit=require('./board-audit');

function fail(code, message) {
  throw Object.assign(new Error(message), {code});
}

const fields = 'id distanceUnit schemaVersion status revision courseId courseName city courseDemo photo date time createdAt updatedAt completedAt finishedAt courseSnapshot ruleSnapshot mainContestId holes playOrder holeOrder players scores currentHole currentPlayer events awards'.split(' ');
function publicRound(round) {
  const result=Object.fromEntries(fields.filter(key => round[key] !== undefined).map(key => [key, round[key]]));
  if(Array.isArray(round.players)){
    const keys=['id','name','accountUid','avatarUrl','isTest','isVirtual','tee','teeId','teeName','holePars','holeSI','holeDistances'];
    result.players=round.players.map(player=>Object.fromEntries(keys.filter(key=>player[key]!==undefined).map(key=>[key,player[key]])));
  }
  return result;
}

function correcting(group){return Object.values(group.cards||{}).some(c=>c.state==='open'&&c.correcting);}
function lockedPlayers(group,activity){return Object.keys(group.cards||{}).filter(id=>group.cards[id].state!=='open'||activity.status!=='active'&&!group.cards[id].correcting);}
function board(activity, group) {
  const competition=activity.kind==='competition';
  return {activityId: activity.id, groupId: group.id, ownerUid: group.ownerUid,primaryScorerUid:group.primaryScorerUid||group.ownerUid,
    round: group.round, version: group.version, cells: group.cells || {}, scorerUids:group.scorerUids||[], rosterEditingSupported:!competition, playerRemovalSupported:!competition, routeEditingSupported:!competition,
    ...(competition?{competition:true,correctionOpen:correcting(group),lockedPlayers:lockedPlayers(group,activity)}:{})};
}
function openRound(round) {
  return round && ['active','paused'].includes(round.status);
}
function canAppend(round) {
  return round.players.length < rules.GROUP_MAX_PLAYERS && round.ruleSnapshot.grouping.type === 'individual' && round.ruleSnapshot.scoring.type !== 'match_play';
}
function availableSeats(round) {
  const seats = round.players.filter(player => !player.accountUid).map(player => ({
    id: player.id, name: player.name, tee: player.tee, played: Object.keys(round.scores[player.id]).length
  }));
  if (canAppend(round)) seats.push({id: '+', name: '新增我的球位', tee: round.players[0].tee, played: 0});
  return seats;
}
function takeSeat(group, user, seatId, time) {
  const round = group.round;
  if (!group.live || !openRound(round)) fail('CLOSED', '这场球已结束');
  if (group.memberUids.includes(user.uid)) return;
  if (seatId === '+') {
    if (!canAppend(round)) fail('FULL','每组最多 16 名球员');
    const source = round.players[0], id = user.uid;
    if (round.players.some(player => player.id === id)) fail('SEAT_TAKEN','球位已变化，请重新选择');
    const player = {id, name: user.name, accountUid: id, avatarUrl:user.avatarUrl || ''};
    for (const key of ['tee','teeName','teeId','holePars','holeSI','holeDistances']) {
      if (source[key] !== undefined) player[key] = source[key];
    }
    round.players.push(player);
    round.scores[id] = {};
    const handicap = round.ruleSnapshot.handicap;
    if (handicap.mode === 'manual_round_total') handicap.totals[id] = 0;
    if (handicap.mode === 'manual_hole') handicap.perHole[id] = Object.fromEntries(round.holes.map(h => [h.number, 0]));
  } else {
    const player = round.players.find(p => p.id === seatId && !p.accountUid);
    if (!player) fail('SEAT_TAKEN','球位已变化，请重新选择');
    player.accountUid = user.uid;
    player.name = user.name;
    player.avatarUrl = user.avatarUrl || '';
    delete player.isTest;
    delete player.isVirtual;
  }
  group.version++;
  round.revision++;
  round.updatedAt = time;
  rules.validateRound(round);
}

function liveActions(repo, uid, now) {
  async function load(tx, input, ownerOnly=false, reading=false) {
    const activity = await tx.get('qy_activities', input.activityId);
    const group = activity?.groups?.find(g => g.id === input.groupId);
    const member = group && (group.memberUids.includes(uid)||(group.scorerUids||[]).includes(uid));
    const competition = activity?.kind === 'competition';
    if (!group || !(member || reading && competition && activity.ownerUid === uid) || (ownerOnly && (competition || group.ownerUid !== uid))) {
      fail('FORBIDDEN',ownerOnly?'只有本组发起人可以管理成员':'你无权操作这张记分牌');
    }
    return {activity, group, competition, member};
  }
  async function enable(input) {
    const source = input.round;
    if (!source || !/^[a-zA-Z0-9_-]{1,80}$/.test(source.id) || !openRound(source) || JSON.stringify(source).length > 350000) fail('INVALID','当前球局不能开启共同记分');
    return repo.transaction(async tx => {
      let activity, group;
      if (input.activityId) {
        ({activity, group} = await load(tx, input, true));
        if (group.round?.id !== source.id) fail('CONFLICT','请先同步这场球的最新成绩');
      } else {
        // A retry after a lost response must return the original group.
        const id = 'live-' + crypto.createHash('sha256').update(JSON.stringify([uid, source.id])).digest('hex').slice(0,36);
        activity = await tx.get('qy_activities', id);
        if (activity) {
          group = activity.groups[0];
          if (group.ownerUid !== uid || group.round.id !== source.id) fail('FORBIDDEN','球局归属不符');
          return board(activity, group);
        }
        const round = publicRound(JSON.parse(JSON.stringify(source)));
        if (!Array.isArray(round.players) || !round.players.some(p => p.id === 'me') || round.players.some(p => typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(p.id) || ['__proto__','constructor','prototype'].includes(p.id))) fail('INVALID','球位无效');
        if (round.players.length > rules.GROUP_MAX_PLAYERS) fail('FULL','新建共享记分组最多 16 名球员');
        const members = [];
        const owner = await tx.get('qy_users',uid);
        const profiles = [];
        for (const player of round.players) {
          const accountId = player.id === 'me' ? uid : player.accountUid;
          if (!accountId) continue;
          if (members.includes(accountId) || (accountId !== uid && !owner.friendUids.includes(accountId))) fail('FORBIDDEN','只能选择已加入常用球友的微信账号');
          const profile = accountId === uid ? owner : await tx.get('qy_users',accountId);
          if (!profile) fail('INVALID','球友资料不可用，请重新选择');
          player.accountUid = accountId;
          player.name = profile.name;
          player.avatarUrl = profile.avatarUrl || '';
          members.push(accountId);
          profiles.push(profile);
        }
        rules.validateRound(round);
        group = {id:'main',name:'第 1 组',ownerUid:uid,memberUids:members,version:0,round,locked:true};
        activity = {id,kind:'practice',title:round.courseName+' · 同组记分',courseId:round.courseId,courseName:round.courseName,
          ownerUid:uid,viewerUids:[],groups:[group],createdAt:now(),updatedAt:now()};
        for (const profile of profiles) {
          profile.activityIds = Array.from(new Set([...profile.activityIds, id]));
          await tx.set('qy_users', profile.uid, profile);
        }
      }
      if (!openRound(group.round)) fail('CLOSED','这场球已结束');
      if (!group.live) {
        group.live = true;
        group.cells = {};
        group.version++;
        await tx.set('qy_activities',activity.id,activity);
      }
      return board(activity,group);
    });
  }
  async function read(input) {
    const {activity,group,competition,member} = await load(repo,input,false,true);
    if (!group.live) fail('INVALID','这组尚未开启共同记分');
    const profiles = input.includeProfiles || input.version !== group.version
      ? (await Promise.all([...group.memberUids,...(group.scorerUids||[])].map(id=>repo.get('qy_users',id)))).filter(Boolean)
        .map(p=>({uid:p.uid,name:p.name,avatarUrl:p.avatarUrl || ''})) : null;
    return {...(input.version === group.version ? {version:group.version} : board(activity,group)),
      ...(profiles?{profiles}:{}),scorerUids:group.scorerUids||[],ownerUid:group.ownerUid,primaryScorerUid:group.primaryScorerUid||group.ownerUid,
      rosterEditingSupported:!competition,playerRemovalSupported:!competition,routeEditingSupported:!competition,
      ...(competition?{competition:true,readOnly:!member||activity.status!=='active'&&!correcting(group),correctionOpen:correcting(group),lockedPlayers:lockedPlayers(group,activity)}:{})};
  }
  async function score(input) {
    return repo.transaction(async tx => {
      const {activity,group,competition} = await load(tx,input);
      const round = group.round;
      const correction=competition&&['ended','revising'].includes(activity.status)&&group.cards?.[input.playerId]?.state==='open'&&group.cards[input.playerId].correcting===true;
      if (!group.live || !openRound(round)&&!correction) fail('CLOSED','这场球已结束，不能继续录入');
      if (round.id !== input.roundId || !round.players.some(p=>p.id===input.playerId) || !round.holes.some(h=>h.number===input.hole)) fail('INVALID','球友或球洞无效');
      if (typeof input.mutationId !== 'string' || !/^[\w-]{1,80}$/.test(input.mutationId)) fail('INVALID','请重新提交本洞成绩');
      const cell = input.playerId + ':' + input.hole;
      const last = group.cells[cell];
      if (last?.actor === uid && last.id === input.mutationId) return board(activity,group);
      if (competition && (activity.status!=='active'&&!correction||group.cards[input.playerId]?.state!=='open')) fail('CLOSED','该记分卡已交卡或锁定');
      if ((last?.version || 0) !== input.cellVersion) fail('CELL_CONFLICT','同组球友刚改了这一格，请核对最新成绩后再记');
      if (input.routeRevision !== undefined && input.routeRevision !== (round.courseSnapshot?.routeRevision || 0)) fail('CELL_CONFLICT','本轮路线已调整，请核对球洞后再记');
      if (input.physicalHoleId && input.physicalHoleId !== round.holes.find(h=>h.number===input.hole)?.id) fail('CELL_CONFLICT','球洞顺序已调整，请核对后再记');
      if (input.score !== null && (typeof input.score !== 'object' || JSON.stringify(input.score).length > 3000)) fail('INVALID','本洞成绩无效');
      const updated = rules.applyOperation(correction?{...round,status:'active'}:round,{type:'score',playerId:input.playerId,holeNumber:input.hole,score:input.score,
        operationId:input.mutationId,baseRevision:round.revision,time:now(),actorId:uid});
      if(correction)updated.status=updated.players.every(p=>rules.rawSummary(updated,p.id).complete)?'finished_complete':'finished_incomplete';
      group.version++;
      group.cells[cell] = {version:group.version, actor:uid, id:input.mutationId};
      if(competition){
        const card=group.cards[input.playerId],before=round.scores[input.playerId][input.hole]||null;
        card.playerConfirmed=null;card.markerConfirmed=null;
        if(before){
          const change={kind:'score-audit',activityId:activity.id,groupId:group.id,playerId:input.playerId,
            hole:input.hole,actor:uid,before,after:updated.scores[input.playerId][input.hole]||null,at:now()};
          group.recentChanges=[...(group.recentChanges||[]),{...change,before:before.grossStrokes,after:change.after?.grossStrokes??null}].slice(-20);
        }
      }
      await Audit.write(tx,activity,group,round,updated,uid,now(),group.cards?.[input.playerId]?.reason||'逐洞记分');
      group.round = publicRound(updated);
      activity.updatedAt = now();
      await tx.set('qy_activities',activity.id,activity);
      return board(activity,group);
    });
  }
  async function addVirtual(input){
    return repo.transaction(async tx=>{
      const {activity,group}=await load(tx,input,true);
      if(!group.live||!openRound(group.round))fail('CLOSED','本轮已结束');
      const old=group.round.players.find(p=>p.id===input.playerId);
      if(old){if(old.isVirtual&&old.name===input.name)return board(activity,group);fail('INVALID','球位编号已被使用');}
      try{group.round=publicRound(require('./lib/score-roster').append(group.round,{id:input.playerId,name:input.name},now()));}
      catch(e){fail('INVALID',e.message);}
      group.version++;activity.updatedAt=now();await tx.set('qy_activities',activity.id,activity);return board(activity,group);
    });
  }
  async function removeScorer(input){
    return repo.transaction(async tx=>{
      const {activity,group}=await load(tx,input,true);
      group.scorerUids=(group.scorerUids||[]).filter(id=>id!==input.uid);if(group.primaryScorerUid===input.uid)group.primaryScorerUid=group.ownerUid;group.version++;activity.updatedAt=now();
      await tx.set('qy_activities',activity.id,activity);return board(activity,group);
    });
  }
  async function removePlayer(input){
    if(typeof input.mutationId!=='string'||!/^[\w-]{1,80}$/.test(input.mutationId))fail('INVALID','请重新选择要移除的球员');
    return repo.transaction(async tx=>{
      const {activity,group}=await load(tx,input,true);
      const receiptId='roster-'+crypto.createHash('sha256').update(JSON.stringify([activity.id,group.id,uid,input.mutationId])).digest('hex');
      const fingerprint=JSON.stringify([input.roundId,input.playerId,input.version]);
      const receipt=await tx.get('qy_activities',receiptId);
      if(receipt){if(receipt.fingerprint!==fingerprint)fail('INVALID','移除请求不一致，请重新选择');return board(activity,group);}
      const before=group.round;
      if(!group.live||!openRound(before))fail('CLOSED','本轮已结束');
      if(input.roundId!==before.id||input.version!==group.version)fail('CONFLICT','组内记录已有更新，请刷新后重新确认');
      const player=before.players.find(p=>p.id===input.playerId);
      try{group.round=publicRound(require('./lib/score-roster').remove(before,input.playerId,{ownerUid:group.ownerUid,time:now(),operationId:input.mutationId}));}
      catch(e){fail('INVALID',e.message);}
      if(player.accountUid){
        group.memberUids=group.memberUids.filter(id=>id!==player.accountUid);
        group.scorerUids=(group.scorerUids||[]).filter(id=>id!==player.accountUid);
        if(group.primaryScorerUid===player.accountUid)group.primaryScorerUid=group.ownerUid;
      }
      group.version++;activity.updatedAt=now();
      // Retain tombstone stamps so an old offline edit cannot target a rejoined seat.
      for(const h of before.holes)(group.cells ||= {})[input.playerId+':'+h.number]={version:group.version};
      await Audit.write(tx,activity,group,before,group.round,uid,now(),'移除球员：'+player.name);
      await tx.set('qy_activities',activity.id,activity);
      await tx.set('qy_activities',receiptId,{kind:'roster-receipt',fingerprint,at:now()});
      return board(activity,group);
    });
  }
  async function primaryScorer(input){return repo.transaction(async tx=>{
    const {activity,group}=await load(tx,input,true);
    if(!group.live||!openRound(group.round))fail('CLOSED','本轮已结束');
    if(!group.memberUids.includes(input.scorerId)&&!(group.scorerUids||[]).includes(input.scorerId))fail('INVALID','请选择已加入的微信球员或记分员');
    group.primaryScorerUid=input.scorerId;group.version++;activity.updatedAt=now();
    await tx.set('qy_activities',activity.id,activity);return board(activity,group);
  });}
  async function finish(input){return repo.transaction(async tx=>{
    const {activity,group}=await load(tx,input,true);
    if(!group.live)fail('INVALID','尚未开启共同记分');
    if(!openRound(group.round))return board(activity,group);
    if(group.version!==input.version)fail('CONFLICT','组内成绩已更新，请刷新核对后再结束');
    const previous=group.round;group.round=publicRound(require('./lib/service').finishRound(group.round,now(),{allowEmpty:true}));
    group.version++;await Audit.write(tx,activity,group,previous,group.round,uid,now(),'结束球局');activity.updatedAt=now();await tx.set('qy_activities',activity.id,activity);
    return board(activity,group);
  });}
  async function history(input){const {activity,group}=await load(repo,input,false,true);return Audit.read(repo,activity,group,input.cursor);}
  return {enable,read,score,addVirtual,removePlayer,removeScorer,primaryScorer,finish,history};
}

// A legacy owner-only whole-round save is still version-checked. Advance each
// modified cell's stamp so an editor with the old score cannot overwrite it.
function acceptOwnerSnapshot(group, next) {
  if (next.players.length !== group.round.players.length || next.players.some((p,i)=>p.id!==group.round.players[i].id || p.accountUid!==group.round.players[i].accountUid)) fail('CONFLICT','组员已更新，请刷新记分牌');
  const routeChanged = JSON.stringify(group.round.holes.map(h=>[h.number,h.id,h.sectionId,h.label])) !== JSON.stringify(next.holes.map(h=>[h.number,h.id,h.sectionId,h.label]))
    || (group.round.courseSnapshot?.routeRevision || 0) !== (next.courseSnapshot?.routeRevision || 0);
  for (const p of next.players) for (const hole of next.holes) {
    if (routeChanged || JSON.stringify(group.round.scores[p.id]?.[hole.number]) !== JSON.stringify(next.scores[p.id]?.[hole.number])) {
      group.cells[p.id+':'+hole.number] = {version:group.version+1};
    }
  }
}
module.exports={liveActions,availableSeats,takeSeat,openRound,acceptOwnerSnapshot,publicRound};

