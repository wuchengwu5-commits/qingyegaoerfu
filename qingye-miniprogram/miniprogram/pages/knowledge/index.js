const K=require('../../services/knowledge'),Scene=require('../../services/scene');
Page({
 data:{categories:[{id:'all',name:'全部'},...K.categories],category:'all',query:'',items:K.articles,total:K.articles.length,count:K.articles.length},
 onLoad(){this.setData({topInset:Scene.topInset()});},
 onShow(){Scene.selectTab(this,2);},
 refresh(){const items=K.list(this.data.category,this.data.query);this.setData({items,count:items.length});},
 category(e){this.setData({category:e.currentTarget.dataset.id});this.refresh();},
 search(e){this.setData({query:e.detail.value});this.refresh();},
 clear(){this.setData({query:'',category:'all'});this.refresh();},
 article(e){const id=e.currentTarget.dataset.id;if(K.find(id))wx.navigateTo({url:'/packages/knowledge/index?id='+id});}
});
