const Dialog = require('../../services/dialog');
Component({
  properties:{range:{type:Array,value:[]},rangeKey:{type:String,value:''},value:{type:null,value:0},disabled:{type:Boolean,value:false},mode:{type:String,value:'selector'},title:{type:String,value:'请选择'},start:{type:String,value:''},end:{type:String,value:''}},
  lifetimes:{detached() { this.detached = true; }},
  methods:{
    open() {
      const d = this.data;
      if (this.selecting || d.disabled || d.mode === 'selector' && !d.range.length) return;
      this.selecting = true;
      const snapshot = JSON.stringify(d.range);
      const options = {title:d.title, value:d.value, success:r => {
        if (this.detached || this.data.disabled) return;
        if (d.mode === 'selector' && snapshot !== JSON.stringify(this.data.range)) return wx.showToast({title:'选项已更新，请重新选择',icon:'none'});
        this.triggerEvent('change', {value:r.value});
      }, fail:() => { if (!this.detached) this.triggerEvent('cancel'); }, complete:() => { this.selecting = false; }};
      if (d.mode === 'date') return Dialog.date({...options,start:d.start || undefined,end:d.end || undefined});
      if (d.mode === 'time') return Dialog.time(options);
      Dialog.select({...options,items:d.range.map(item => ({label:String(d.rangeKey ? item[d.rangeKey] : item)}))});
    }
  }
});
