const B=require('../../services/backgrounds');
Page({
 data:{mode:'auto',themeId:'01-spring-morning',items:[],saving:false,preview:B.FALLBACK,previewMirrored:B.FALLBACK_THEME.mirrored,status:'',currentName:'春日晨光'},
 onLoad(){this.unloaded=false;this.restore();this.off=B.watch(s=>this.setData({currentName:s.name,status:s.status==='fallback'?s.reason:s.status==='loading'?'正在轻轻换一幅风景…':s.reason}));B.refreshCatalog(true).then(()=>{if(!this.unloaded)this.restore(false);});},
 onShow(){B.apply();},onUnload(){this.unloaded=true;if(this.off)this.off();},
 restore(reset=true){const p=B.preferences();const mode=reset?p.mode:this.data.mode,id=reset?p.themeId:this.data.themeId;this.setData({mode,themeId:id,items:B.items().map(x=>({...x,description:{spring:'春日 · 晨光',summer:'夏日 · 晴午',autumn:'秋日 · 午后',winter:'冬日 · 暖阳'}[x.season]||(x.id==='05-misty-dawn'?'清晨 · 薄雾':x.id==='06-lakeside-sunset'?'傍晚 · 夕照':x.weather==='rain'?'天气 · 细雨':x.weather==='snow'?'天气 · 轻雪':'球场时光')}))});this.updatePreview();},
 updatePreview(){const choice=B.selectTheme(B.items(),{mode:this.data.mode,themeId:this.data.themeId});this.setData({preview:choice.theme.fileID,previewMirrored:choice.theme.mirrored,previewName:choice.theme.name,previewReason:choice.reason});},
 mode(e){this.setData({mode:e.currentTarget.dataset.mode});this.updatePreview();},
 select(e){this.setData({mode:'manual',themeId:e.currentTarget.dataset.id});this.updatePreview();},
 imageError(){this.setData({preview:B.FALLBACK,previewMirrored:B.FALLBACK_THEME.mirrored});},
 async save(){if(this.data.saving)return;this.setData({saving:true});try{await B.save({mode:this.data.mode,themeId:this.data.themeId});if(this.unloaded)return;wx.showToast({title:'背景已保存',icon:'success'});wx.switchTab({url:'/pages/home/index'});}catch(e){if(!this.unloaded)wx.showToast({title:e.message||'未能保存，请重试',icon:'none'});}finally{if(!this.unloaded)this.setData({saving:false});}}
});
