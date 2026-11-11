const K=require('../../services/knowledge'),articles=require('./articles');
Page({
 data:{article:null,category:null,items:[],missing:false,reviewed:'2026-10-30'},
 onLoad(o={}){
  if(o.id){const meta=K.find(o.id),body=articles[o.id];if(meta&&body)this.setData({article:{...meta,...body}});else this.setData({missing:true});}
  else{const category=K.category(o.category)||K.category('rules');this.setData({category,items:K.list(category.id)});}
 },
 article(e){const id=e.currentTarget.dataset.id;if(K.find(id))wx.navigateTo({url:'/packages/knowledge/index?id='+id});},
 source(e){const s=this.data.article?.sources[Number(e.currentTarget.dataset.index)];if(s)wx.setClipboardData({data:s.url});},
 library(){
  const stack=typeof getCurrentPages==='function'?getCurrentPages():[];
  const previous=stack.slice(0,-1).map(p=>p.route).lastIndexOf('pages/knowledge/index');
  if(previous>=0)wx.navigateBack({delta:stack.length-1-previous});
  else wx.redirectTo({url:'/pages/knowledge/index'});
 }
});
