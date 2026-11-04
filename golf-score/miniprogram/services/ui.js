const S=require('./store');
function run(fn){try{return fn();}catch(e){wx.showToast({title:e.message||'操作失败',icon:'none',duration:3000});return null;}}
function go(page,query=''){wx.navigateTo({url:'/pages/'+page+'/index'+query});}
function tab(page){wx.switchTab({url:'/pages/'+page+'/index'});}
function confirm(title,content,fn){wx.showModal({title,content,success:r=>{if(r.confirm)run(fn);}});}
module.exports={S,run,go,tab,confirm};
