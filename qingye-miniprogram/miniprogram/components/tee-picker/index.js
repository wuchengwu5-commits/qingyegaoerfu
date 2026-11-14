const Dialog = require('../../services/dialog');
const {swatch}=require('../../services/tee-colors');
Component({
 properties:{range:{type:Array,value:[]},value:{type:Number,value:0}},
 data:{options:[],current:null},
 lifetimes:{detached(){this.detached=true;}},
 observers:{'range,value':function(range,value){const options=range.map((name,index)=>({name,index,color:swatch(name)}));this.setData({options,current:options[value]||null});}},
 methods:{
  show(){
   if(this.selecting||!this.data.options.length)return;
   this.selecting=true;const snapshot=JSON.stringify(this.data.range);
   Dialog.select({title:'选择发球台',value:this.data.value,items:this.data.options.map(item=>({label:item.name,color:item.color})),success:r=>{
    if(this.detached)return;
    if(snapshot!==JSON.stringify(this.data.range))return wx.showToast({title:'发球台已更新，请重新选择',icon:'none'});
    this.triggerEvent('change',{value:r.value});
   },complete:()=>{this.selecting=false;}});
  }

 }
});
