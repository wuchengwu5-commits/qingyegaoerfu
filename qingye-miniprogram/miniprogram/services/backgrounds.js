const Media=require('./media'),cfg=require('../config');
// Move foliage out of the homepage copy area without changing the cached images.
const mirroredThemes=new Set(['01-spring-morning','03-autumn-afternoon','04-winter-sun','08-light-snow']);
const registry=require('./backgrounds-data').map(theme=>({...theme,mirrored:mirroredThemes.has(theme.id)}));
const KEY='qingye.background.settings.v1',CATALOG='qingye.background.catalog.v1',FALLBACK='/assets/spring-morning.jpg';
const fallbackTheme={...registry[0],fileID:FALLBACK};
const listeners=new Set();let records=null,loading=null,requested='',epoch=0,timer=null,lastCatalog=0,catalogJob=null;
let scene={src:FALLBACK,id:fallbackTheme.id,name:fallbackTheme.name,isOriginal:false,status:'ready',mode:'auto',reason:'跟随季节与时间'};
function get(key){try{return typeof wx!=='undefined'?wx.getStorageSync(key):null;}catch(_){return null;}}
function put(key,value){if(typeof wx==='undefined'||typeof wx.setStorageSync!=='function')throw Error('暂时无法保存，请重试');wx.setStorageSync(key,value);}
function root(){return (cfg.mediaRoot||'').replace(/\/media-v1\/?$/,'');}
function expected(row){return root()+'/'+row.cloudPath;}
function validRows(rows){return (rows||[]).filter(x=>registry.some(r=>r.id===x.id&&r.sha256===x.sha256&&x.fileID===expected(r))).map(x=>({...registry.find(r=>r.id===x.id),name:typeof x.name==='string'?x.name.slice(0,30):x.id,fileID:x.fileID}));}
function items(){if(!records){const cached=get(CATALOG);records=validRows(cached?.items);if(!records.length)records=registry.map(x=>({...x,fileID:expected(x)}));}return records.map(x=>x.id===fallbackTheme.id?{...x,fileID:FALLBACK}:x);}
function preferences(){const v=get(KEY),known=items().some(x=>x.id===v?.themeId),next={mode:v?.mode==='manual'?'manual':'auto',themeId:known?v.themeId:fallbackTheme.id};if(v?.themeId==='original')try{put(KEY,next);}catch(_){}return next;}
function selectTheme(list,settings,now=new Date()){
 const fallback=list.find(x=>x.id===fallbackTheme.id)||fallbackTheme;
 if(settings.mode==='manual')return {theme:list.find(x=>x.id===settings.themeId)||fallback,reason:'固定使用这张风景'};
 const date=now instanceof Date&&!isNaN(now)?now:new Date(),month=date.getMonth()+1,hour=date.getHours();
 const season=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
 const seasonal={spring:'01-spring-morning',summer:'02-summer-noon',autumn:'03-autumn-afternoon',winter:'04-winter-sun'};
 let id=seasonal[season],reason={spring:'春日风景',summer:'夏日风景',autumn:'秋日风景',winter:'冬日风景'}[season];
 if(hour>=5&&hour<8&&season!=='winter'){id='05-misty-dawn';reason='清晨 · 跟随当前时间';}
 else if(hour>=16&&hour<19){id='06-lakeside-sunset';reason='傍晚 · 跟随当前时间';}
 const theme=list.find(x=>x.id===id&&!x.manualOnly)||list.find(x=>x.id===seasonal[season]&&!x.manualOnly)||fallback;
 return {theme,reason};
}
function display(){return {...scene,mirrored:mirroredThemes.has(scene.id)};}
function emit(){for(const fn of listeners)try{fn(display());}catch(_){}}
function watch(fn){listeners.add(fn);fn(display());return ()=>listeners.delete(fn);}
function apply(now=new Date()){
 const prefs=preferences(),choice=selectTheme(items(),prefs,now),theme=choice.theme,key=theme.fileID;
 if(requested===key&&loading){scene={...scene,mode:prefs.mode,reason:choice.reason};emit();return loading;}
 if(requested===key&&scene.status==='ready'){scene={...scene,mode:prefs.mode,reason:choice.reason};emit();return Promise.resolve(display());}
 const revision=++epoch;requested=key;
 if(key===FALLBACK){loading=null;scene={src:FALLBACK,id:theme.id,name:theme.name,isOriginal:false,status:'ready',mode:prefs.mode,reason:choice.reason};emit();return Promise.resolve(display());}
 scene={...scene,status:'loading',mode:prefs.mode,requestedId:theme.id,reason:choice.reason};emit();
 const task=Media.local(key).then(src=>{
  if(revision===epoch){scene={...scene,src,id:theme.id,name:theme.name,isOriginal:false,status:'ready',mode:preferences().mode};emit();}
  return display();
 }).catch(()=>{
  if(revision===epoch){requested='';scene={src:FALLBACK,id:fallbackTheme.id,name:fallbackTheme.name,isOriginal:false,status:'fallback',mode:prefs.mode,reason:'网络暂不可用，先看春日晨光'};emit();}
  return display();
 }).finally(()=>{if(loading===task)loading=null;});
 loading=task;return task;
}
function save(settings){const next={mode:settings.mode==='manual'?'manual':'auto',themeId:settings.themeId};if(!items().some(x=>x.id===next.themeId))throw Error('请选择一张可用背景');put(KEY,next);return apply();}
function imageFailed(){if(scene.src===FALLBACK)return;Media.forget(requested);epoch++;requested='';scene={...scene,src:FALLBACK,id:fallbackTheme.id,name:fallbackTheme.name,isOriginal:false,status:'fallback',reason:'图片暂不可用，先看春日晨光'};emit();}
async function refreshCatalog(force=false){
 if(catalogJob)return catalogJob;if(!force&&Date.now()-lastCatalog<3600000)return items();
 const cloud=require('./cloud-client').init();if(!cloud?.callFunction||wx.__preview)return items();
 catalogJob=(async()=>{try{const result=await cloud.callFunction({name:'qingyeThemes',data:{action:'list'}}),data=result.result?.data;if(!result.result?.ok||!Array.isArray(data?.items))return items();const valid=validRows(data.items);if(!valid.length)return items();records=valid;lastCatalog=Date.now();try{put(CATALOG,{items:valid});}catch(_){}await apply();return items();}catch(_){return items();}finally{catalogJob=null;}})();return catalogJob;
}
function resume(){pause();apply();refreshCatalog();timer=setInterval(()=>apply(),60000);}
function pause(){if(timer)clearInterval(timer);timer=null;}
module.exports={items,preferences,selectTheme,display,watch,apply,save,imageFailed,refreshCatalog,resume,pause,FALLBACK,FALLBACK_THEME:fallbackTheme};
