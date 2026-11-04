// Preserve links from the former score landing page.
const K=require('../../services/knowledge');
Page({onLoad(o={}){
 const aliases={spirit:'safety',score:'scoring',record:'scoring',stroke:'formats',match:'formats',company:'safety'};
 const id=aliases[o.article]||o.article,category=o.group==='formats'?'basics':(K.category(o.group)?.id||'rules');
 wx.redirectTo({url:'/packages/knowledge/index'+(K.find(id)?'?id='+id:'?category='+category)});
}});
