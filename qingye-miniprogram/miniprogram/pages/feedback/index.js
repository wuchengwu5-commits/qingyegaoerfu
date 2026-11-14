const Feedback=require('../../services/feedback'),Account=require('../../services/account');
const KEY='qingye.feedback.native.v1';
const initial=()=>({category:'体验建议',content:'',contact:''});
function read(){const saved=wx.getStorageSync(KEY)||{};return {draft:{...initial(),...(saved.draft||{})},receipts:Array.isArray(saved.receipts)?saved.receipts:[]};}
Page({
  data:{categories:['体验建议','功能异常','球场资料纠错','版权与合作'],draft:initial(),receipts:[],tab:'new',busy:false,loading:false,checking:false,loggedIn:false,connected:false,isAdmin:false,adminItems:[],adminCount:0,selected:null,error:''},
  onLoad(){this.epoch=0;this.visible=false;this.refresh();this.offAccount=Account.subscribe(user=>{this.clearPrivate(!user);if(user&&this.visible)this.connect();});},
  onShow(){this.visible=true;this.connect();},
  onHide(){this.visible=false;this.clearPrivate();},
  onUnload(){this.visible=false;this.epoch++;this.ownerKey='';this.offAccount?.();},
  clearPrivate(resetTab=false){this.epoch++;this.ownerKey='';this.setData({loggedIn:false,connected:false,isAdmin:false,adminItems:[],adminCount:0,selected:null,receipts:[],busy:false,loading:false,checking:false,error:'',...(resetTab&&this.data.tab==='admin'?{tab:'new'}:{})});},
  refresh(){const d=read();this.setData({draft:d.draft,categoryIndex:Math.max(0,this.data.categories.indexOf(d.draft.category))});},
  async connect(){
    this.clearPrivate();const epoch=this.epoch;this.setData({checking:true});
    try{
      await Account.login();if(epoch!==this.epoch)return;this.setData({loggedIn:true});
      if(!Feedback.enabled())throw Error('请在微信小程序中连接反馈服务，草稿已保留');
      const access=await Feedback.call('access');if(epoch!==this.epoch)return;this.ownerKey=access.ownerKey;this.setData({connected:access.accepting===true,isAdmin:access.isAdmin===true});
      if(this.data.tab==='admin'&&!this.data.isAdmin)this.setData({tab:'new'});if(this.data.tab==='history')await this.status();if(this.data.tab==='admin'&&this.data.isAdmin)await this.loadAdmin();
    }catch(e){if(epoch===this.epoch){if(['AUTH','AUTH_REQUIRED','SESSION_ENDED','ACCOUNT_CHANGED'].includes(e.code))this.clearPrivate(true);else this.setData({error:e.message});}}
    finally{if(epoch===this.epoch)this.setData({checking:false});}
  },
  login(){Account.needLogin();},
  input(e){if(this.data.busy)return;const key=e.currentTarget.dataset.key;if(!['content','contact'].includes(key))return;const d=read();if(d.draft[key]!==e.detail.value)delete d.draft.receiptToken;d.draft[key]=e.detail.value;wx.setStorageSync(KEY,d);this.refresh();},
  category(e){if(this.data.busy)return;const category=this.data.categories[Number(e.detail.value)];if(!category)return;const d=read();if(d.draft.category!==category)delete d.draft.receiptToken;d.draft.category=category;wx.setStorageSync(KEY,d);this.refresh();},
  tab(e){if(this.data.busy)return;const tab=e.currentTarget.dataset.id;if(!['new','history','admin'].includes(tab)||(tab==='admin'&&(!this.data.loggedIn||!this.data.isAdmin)))return;this.setData({tab,error:'',selected:null});if(tab==='history')this.status();if(tab==='admin')this.loadAdmin();},
  async submit(){
    if(this.data.busy||this.data.checking)return;if(!this.data.loggedIn)return this.login();const d=read();if(d.draft.content.trim().length<5)return wx.showToast({title:'请至少填写5个字',icon:'none'});
    if(!this.data.connected)return wx.showToast({title:'草稿已保存，请先重试连接',icon:'none'});
    const epoch=this.epoch;this.setData({busy:true,error:''});
    try{
      if(!d.draft.receiptToken){d.draft.receiptToken=await Feedback.token();if(epoch!==this.epoch)return;wx.setStorageSync(KEY,d);}
      await Feedback.call('submit',{...d.draft,requestId:d.draft.receiptToken});
      if(epoch!==this.epoch)return;
      const latest=read();if(latest.draft.receiptToken===d.draft.receiptToken){latest.draft=initial();wx.setStorageSync(KEY,latest);}
      this.refresh();this.setData({tab:'history'});wx.showToast({title:'反馈已提交'});await this.status();
    }catch(e){if(epoch===this.epoch)this.setData({error:e.message||'提交未完成，草稿已保留'});}
    finally{if(epoch===this.epoch)this.setData({busy:false});}
  },
  async status(){
    if(!this.data.loggedIn){this.setData({receipts:[],loading:false});return;}
    const epoch=this.epoch;this.setData({loading:true,error:''});
    try{
      if(!this.data.connected)throw Error('尚未连接反馈服务，请返回提交页重试连接');
      const cloud=await Feedback.all('mine');
      if(epoch!==this.epoch)return;
      this.setData({receipts:cloud.map(Feedback.decorate)});
    }catch(e){if(epoch===this.epoch)this.setData({error:e.message});}
    finally{if(epoch===this.epoch)this.setData({loading:false});}
  },
  async loadAdmin(){
    if(!this.data.loggedIn||!this.data.isAdmin||this.data.loading)return;const epoch=this.epoch;this.setData({loading:true,error:''});
    try{const rows=await Feedback.all('list');if(epoch===this.epoch)this.setData({adminItems:rows.map(Feedback.decorate),adminCount:rows.length});}
    catch(e){if(epoch===this.epoch){this.setData({error:e.message});if(e.code==='FORBIDDEN')this.setData({isAdmin:false,adminItems:[],adminCount:0,selected:null,tab:'new'});}}
    finally{if(epoch===this.epoch)this.setData({loading:false});}
  },
  selectFeedback(e){if(!this.data.loggedIn||!this.data.isAdmin)return;const row=this.data.adminItems.find(x=>x.id===e.currentTarget.dataset.id);if(!row||this.data.busy)return;this.setData({selected:{...row},error:''});},
  backToList(){if(!this.data.busy)this.setData({selected:null});},
  exportFeedback(){if(!this.data.loggedIn||!this.data.isAdmin||this.data.loading)return;const rows=this.data.adminItems.map(({id,category,content,status,created,updated,reply,note,version})=>({id,category,content,status,created,updated,reply,note,version}));wx.setClipboardData({data:JSON.stringify({exportedAt:Date.now(),items:rows},null,2)});},
  copyIdentity(){if(this.ownerKey)wx.setClipboardData({data:this.ownerKey});},
  contact(){wx.makePhoneCall({phoneNumber:'18521597226'});}
});
