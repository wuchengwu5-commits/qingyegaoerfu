Component({
 data:{selected:0,hidden:false,tabs:[
  {page:'home',text:'首页',icon:'nav-home'},
  {page:'play',text:'记分',icon:'flag'},
  {page:'courses',text:'球场',icon:'nav-pin'},
  {page:'profile',text:'我的',icon:'nav-profile'}
 ]},
 lifetimes:{attached(){const pages=getCurrentPages(),route=pages[pages.length-1]?.route,i=this.data.tabs.findIndex(t=>'pages/'+t.page+'/index'===route);if(i>=0)this.setData({selected:i});}},
 methods:{switchTab(e){if(this.data.hidden)return;const page=e.currentTarget.dataset.page,index=this.data.tabs.findIndex(t=>t.page===page);if(index<0)return;if(page==='play'){require('../services/score-entry').resume();return;}if(index===this.data.selected)return;const previous=this.data.selected;this.setData({selected:index});wx.switchTab({url:'/pages/'+page+'/index',fail:()=>this.setData({selected:previous})});}}
});
