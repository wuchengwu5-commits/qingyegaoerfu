const S=require('./store');
function run(fn){try{return fn();}catch(e){wx.showToast({title:e.message||'操作失败',icon:'none',duration:3000});return null;}}
const tabs=['home','courses','knowledge','profile'];function go(page,query=''){if(page==='play')return tab('courses');if(tabs.includes(page)&&!query)return tab(page);wx.navigateTo({url:'/pages/'+page+'/index'+query});}
function tab(page){if(page==='play')page='courses';if(!tabs.includes(page))return go(page);wx.switchTab({url:'/pages/'+page+'/index'});}
function confirm(title,content,fn){wx.showModal({title,content,success:r=>{if(r.confirm)run(fn);}});}
function logout(after){wx.showModal({title:'退出登录？',content:'球局、成绩和待同步记录会保留，重新登录后可继续同步。',confirmText:'退出登录',success:r=>{if(!r.confirm)return;require('./account').logout();if(after)after();wx.switchTab({url:'/pages/profile/index'});wx.showToast({title:'已退出登录',icon:'success'});}});}
module.exports={S,run,go,tab,confirm,logout};
