function topInset(){const w=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():{};return Math.max(w.statusBarHeight||0,w.safeArea?.top||0)+30;}
function selectTab(page,index){if(typeof page.getTabBar==='function'){const bar=page.getTabBar();if(bar)bar.setData({selected:index,hidden:false});}}
function setTabHidden(page,hidden){if(typeof page.getTabBar==='function'){const bar=page.getTabBar();if(bar)bar.setData({hidden});}}
function coursePhoto(id){let n=0;for(const ch of id||'')n=(n*31+ch.charCodeAt(0))>>>0;return require('./media').fileID('/assets/course-'+n%3+'.jpg');}
function courseThumbnail(id){let n=0;for(const ch of id||'')n=(n*31+ch.charCodeAt(0))>>>0;const root=require('../config').mediaRoot.replace(/\/media-v1\/?$/,'');return root+'/'+require('./course-thumbnails')[n%3];}
module.exports={topInset,selectTab,setTabHidden,coursePhoto,courseThumbnail};
