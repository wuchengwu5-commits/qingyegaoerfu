const {chromium}=require('/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const url='file://'+path.resolve(__dirname,'../dist/index.html');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[];
 const make=async()=>{const ctx=await browser.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return p};
 const shot=async(p,name)=>{await p.evaluate(()=>document.getElementById('toast').textContent='');await p.screenshot({path:path.join(__dirname,name),animations:'disabled'})};
 const next=p=>p.locator('#actiondock [data-action="next"]').click();
 const save=p=>p.locator('#actiondock [data-action="save"]').click();
 const view=(p,v)=>p.locator(`#bottomnav [data-view="${v}"]`).click();
 const actor=async(p,i)=>{await p.locator('#identitybar [data-action="members"]').click();await p.locator(`[data-actor="${i}"]`).click()};
 const start=async(p,n=4,mode='stroke')=>{await p.locator(`[data-choice="count"][data-value="${n}"]`).click();await next(p);await p.locator(`[data-template="${mode}"]`).click();await next(p);await next(p)};
 let p=await make();await start(p);
 assert.match(await p.locator('#identitybar').innerText(),/创建者/);
 await p.locator('#identitybar [data-action="members"]').click();await shot(p,'v3-01-switch.png');await p.locator('[data-actor="1"]').click();
 assert.equal(await p.evaluate(()=>activeIndex()),1);
 assert.match(await p.locator('#actiondock').innerText(),/保存我的成绩/);
 assert(await p.locator('[data-step="1"][data-person="0"]').isDisabled());
 assert(!(await p.locator('[data-step="1"][data-person="1"]').isDisabled()));
 await save(p);assert.equal(await p.evaluate(()=>store.round.hole),0);
 await p.locator('[data-score="4"][data-person="1"]').click();await save(p);
 assert.deepEqual(await p.evaluate(()=>store.round.records.map(row=>row[0])),[null,{gross:4,kind:'holed'},null,null]);
 assert.equal(await p.evaluate(()=>store.round.hole),1);
 assert.equal(await p.evaluate(()=>store.round.history[0].name),await p.evaluate(()=>c().players[1].name));
 await p.locator('[data-hole="0"]').click();await shot(p,'v3-02-self-score.png');
 await p.locator('[data-step="1"][data-person="1"]').click();await save(p);
 assert.equal(await p.evaluate(()=>store.round.records[1][0].gross),5);
 assert.deepEqual(await p.evaluate(()=>store.round.history.at(-1).changes[0]),{player:1,hole:0,from:{gross:4,kind:'holed'},to:{gross:5,kind:'holed'}});
 await p.locator('[data-action="undo"]').click();assert.equal(await p.evaluate(()=>store.round.records[1][0].gross),4);assert.equal(await p.evaluate(()=>store.round.history.at(-1).type),'undo');
 await actor(p,2);assert.equal(await p.evaluate(()=>store.round.hole),0);
 await p.locator('[data-score="5"][data-person="2"]').click();await save(p);
 await actor(p,1);assert.equal(await p.evaluate(()=>store.round.hole),0);assert(await p.locator('[data-action="undo"]').isDisabled());
 // A stale or altered control still cannot write another player's score.
 await p.evaluate(()=>{const b=document.createElement('button');b.dataset.step='1';b.dataset.person='2';document.body.append(b);b.click();b.remove()});
 assert.equal(await p.evaluate(()=>draftScores[2].gross),5);
 await p.locator('[data-step="1"][data-person="1"]').click();await save(p);
 assert.deepEqual(await p.evaluate(()=>store.round.records.map(row=>row[0]?.gross??null)),[null,5,5,null]);
 // Each identity retains its own hole cursor and sees its own summary.
 await actor(p,2);assert.equal(await p.evaluate(()=>store.round.hole),1);
 await view(p,'card');assert.equal(await p.locator('.hero-metrics strong').nth(1).innerText(),'5');
 await p.locator('[data-edit-hole="0"][data-person="0"]').click();assert.equal(await p.locator('[data-score][data-person="0"]').count(),0);assert.match(await p.locator('.readonly-note').innerText(),/本人或创建者/);
 await actor(p,0);await p.locator('[data-hole="0"]').click();await p.locator('[data-step="1"][data-person="1"]').click();await save(p);
 assert.equal(await p.evaluate(()=>store.round.records[1][0].gross),6);
 assert.equal(await p.evaluate(()=>store.round.history.at(-1).actor),0);
 await actor(p,1);await p.locator('[data-hole="0"]').click();await p.locator('[data-action="history"]').click();await shot(p,'v3-03-history.png');assert.match(await p.locator('.history-list').innerText(),/5 杆 → 6 杆/);
 await p.locator('[data-action="close"]').first().click();await p.reload();assert.equal(await p.evaluate(()=>activeIndex()),1);assert.equal(await p.evaluate(()=>store.round.records[1][0].gross),6);
 // Unsaved edits are not discarded silently on identity changes.
 await p.locator('[data-step="1"][data-person="1"]').click();await actor(p,3);assert.match(await p.locator('.dialog').innerText(),/还未保存/);assert.equal(await p.evaluate(()=>activeIndex()),1);await p.locator('[data-action="close"]').first().click();
 await actor(p,3);await p.locator('[data-action="discard"]').click();assert.equal(await p.evaluate(()=>activeIndex()),3);assert.equal(await p.evaluate(()=>store.round.records[1][0].gross),6);
 await p.locator('.topbar [data-action="settings"]').click();assert.equal(await p.locator('.dialog [data-action="filldemo"]').count(),0);await p.locator('[data-action="close"]').first().click();
 await p.evaluate(()=>action('confirmdemo'));assert.equal(await p.evaluate(()=>store.round.records[0][0]),null);
 await p.evaluate(()=>action('confirmunlock'));assert.equal(await p.evaluate(()=>store.round.history.at(-1).type),'save');
 // A member can clear their own prior entry, with a traceable revision.
 await actor(p,1);await p.locator('[data-hole="0"]').click();await p.locator('[data-clear="1"]').click();await save(p);assert.equal(await p.evaluate(()=>store.round.records[1][0]),null);assert.equal(await p.evaluate(()=>store.round.records[2][0].gross),5);
 await actor(p,0);await p.locator('.topbar [data-action="settings"]').click();await p.locator('.dialog [data-action="filldemo"]').click();await p.locator('[data-action="confirmdemo"]').click();await p.locator('#actiondock [data-action="finish"]').click();await p.locator('#finish-check').check();await p.locator('#confirm-finish').click();
 await actor(p,1);assert(await p.locator('[data-step="1"][data-person="1"]').isDisabled());assert.match(await p.locator('.readonly-note').innerText(),/创建者/);
 await view(p,'card');assert.equal(await p.locator('[data-action="unlock"]').count(),0);
 await actor(p,0);await view(p,'card');await p.locator('[data-action="unlock"]').click();await p.locator('[data-action="confirmunlock"]').click();assert.equal(await p.evaluate(()=>store.round.finished),false);
 console.log('PASS independent self save/edit/clear, creator delegation, per-actor cursors, audit before/after, guarded undo, read-only others, dirty switch guard, persistent roles, finish/unlock permissions');
 for(const n of [2,6]){p=await make();await start(p,n,'stableford');await actor(p,n-1);await p.locator(`[data-pickup="${n-1}"]`).click();await save(p);assert.equal(await p.evaluate(()=>G.summary(c(),store.round.records,activeIndex()).value),0);assert.equal(await p.evaluate(()=>store.round.records.filter(row=>row[0]).length),1);await p.locator('[data-action="allpar"]').click();assert.equal(await p.evaluate(()=>draftScores.filter(Boolean).length),1);await save(p);for(const w of [320,390]){await p.setViewportSize({width:w,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}}
 console.log('PASS 2- and 6-player own-only quick par / pickup and 320/390 mobile layouts');
 // Existing V2 rounds acquire role/history metadata without losing score data.
 p=await make();await start(p);await p.evaluate(()=>{store.round.records[2][3]={gross:7,kind:'holed'};delete store.round.history;delete store.round.cursors;delete store.actor;persist()});await p.reload();assert.equal(await p.evaluate(()=>store.round.records[2][3].gross),7);assert.equal(await p.evaluate(()=>activeIndex()),0);assert.deepEqual(await p.evaluate(()=>store.round.history),[]);
 console.log('PASS V2 local-data migration');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS zero browser errors');
})().catch(e=>{console.error(e);process.exit(1)});
