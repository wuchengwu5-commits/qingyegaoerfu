App({ onLaunch() { try { require('./services/store').init(); } catch(e) { wx.showToast({title:'数据升级未完成，原记录已保留',icon:'none',duration:3000}); } } });
