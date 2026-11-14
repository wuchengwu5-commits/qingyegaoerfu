const Dialog = require('../../services/dialog');
const Values = require('../../services/dialog-values');
Component({
  data:{open:false, kind:'', title:'', content:'', message:'', editable:false, inputValue:'', options:[], selected:0, showCancel:true,
    confirmText:'确定', cancelText:'取消', placeholder:'请输入', inputType:'text', maxLength:500, keyboard:0,
    weekdays:['日','一','二','三','四','五','六'], hours:Array.from({length:24}, (_, i) => Values.pad(i)), minutes:Array.from({length:60}, (_, i) => Values.pad(i))},
  lifetimes:{
    attached() {
      this.connection = Dialog.register(Dialog.currentPage(), {show:item => this.present(item), hide:() => this.setData({open:false, keyboard:0})});
    },
    detached() { this.connection?.detach(); }
  },
  pageLifetimes:{show() { this.connection?.show(); }, hide() { this.connection?.hide(); }},
  methods:{
    present(item) {
      this.request = item;
      const o = item.options, kind = item.kind;
      const options = (kind === 'actions' ? o.itemList : o.items || []).map((x, index) => typeof x === 'string' ? {label:x, index} : {...x, index});
      const selected = Math.max(0, Math.min(Number(o.value) || 0, options.length - 1));
      const values = {open:true, kind, title:o.title || (kind === 'actions' ? '请选择操作' : '请选择'),
        content:o.editable ? '' : o.content || '', message:o.message || '', editable:!!o.editable,
        inputValue:o.editable ? String(o.value ?? o.content ?? '') : '', inputType:o.inputType || 'text', maxLength:o.maxLength ?? 500,
        placeholder:o.placeholderText || '请输入', options, selected, scrollTo:'option-'+selected,
        showCancel:o.showCancel !== false, confirmText:o.confirmText || '确定', cancelText:o.cancelText || '取消', keyboard:0};
      if (kind === 'date') {
        values.date = Values.dateValue(o.value, o.start, o.end);
        Object.assign(values, Values.calendar(values.date, o.start, o.end));
      }
      if (kind === 'time') {
        const time = Values.timeValue(o.value).split(':');
        Object.assign(values, {hour:time[0], minute:time[1], hourScroll:'hour-'+time[0], minuteScroll:'minute-'+time[1]});
      }
      this.setData(values);
    },
    stop() {},
    close() { Dialog.finish(this.request?.id, {confirm:false, cancel:true, content:''}, true); },
    mask() { if (this.data.kind !== 'modal' || this.data.showCancel) this.close(); },
    input(e) { this.setData({inputValue:e.detail.value}); },
    keyboard(e) { this.setData({keyboard:Math.max(0, e.detail.height || 0)}); },
    choose(e) {
      const selected = Number(e.currentTarget.dataset.index);
      if (!this.data.options[selected] || this.data.options[selected].disabled) return;
      if (this.data.kind === 'actions') return Dialog.finish(this.request.id, {tapIndex:selected});
      this.setData({selected});
    },
    changeMonth(e) {
      const delta = Number(e.currentTarget.dataset.delta), next = new Date(this.data.year, this.data.month - 1 + delta, 1);
      const o = this.request.options, date = Values.dateValue(Values.iso(next.getFullYear(), next.getMonth(), 1), o.start, o.end);
      this.setData(Values.calendar(date, o.start, o.end));
    },
    chooseDate(e) {
      const date = e.currentTarget.dataset.value;
      if (this.data.days.some(day => day.value === date && !day.disabled)) this.setData({date});
    },
    chooseTime(e) { const {part, value} = e.currentTarget.dataset; if (part === 'hour' || part === 'minute') this.setData({[part]:Values.pad(Number(value))}); },
    confirm() {
      const d = this.data;
      if (d.kind === 'modal') return Dialog.finish(this.request.id, {confirm:true, cancel:false, content:d.inputValue});
      if (d.kind === 'select' && (!d.options[d.selected] || d.options[d.selected].disabled)) return;
      const value = d.kind === 'date' ? d.date : d.kind === 'time' ? d.hour + ':' + d.minute : d.selected;
      Dialog.finish(this.request.id, {value});
    }
  }
});
