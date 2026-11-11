const K=require('../../services/knowledge');
Page({
 data:{expanded:false,essentials:['scoring','lost','penalty-area'].map(id=>K.find(id)),categories:[{id:'all',name:'全部'},...K.categories],category:'all',query:'',items:K.articles,total:K.articles.length,count:K.articles.length},
 toggle(){this.setData({expanded:!this.data.expanded});},
 refresh(){const items=K.list(this.data.category,this.data.query);this.setData({items,count:items.length});},
 category(e){this.setData({category:e.currentTarget.dataset.id});this.refresh();},
 search(e){this.setData({query:e.detail.value});this.refresh();},
 clear(){this.setData({query:'',category:'all'});this.refresh();},
 article(e){const id=e.currentTarget.dataset.id;if(K.find(id))wx.navigateTo({url:'/packages/knowledge/index?id='+id});}
});
