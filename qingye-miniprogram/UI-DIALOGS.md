# 统一弹层

用户已确定：业务对话框不用微信默认 UI。此规则适用于当前所有页面和后续开发。

所有弹层共享 `qy-dialog` 宿主：浅色圆角底部面板、绿色主操作、清楚的标题和大选项行。球场/洞段等选项用列表，日期用日历，时间用双列选择，发球台用带颜色圆点的列表。

## 接入

每个页面 WXML 根层保留一个 `<qy-dialog class="page-dialog"/>`，组件已在 app.json 全局注册。JS 引入 `services/dialog`：

```js
Dialog.modal({title:'结束本组？',content:'已记成绩会保留。',confirmText:'结束本组',success:r=>{if(r.confirm)finish();}});
Dialog.modal({title:'手动球员姓名',editable:true,value:'',placeholderText:'输入姓名',maxLength:20,success:r=>{if(r.confirm)add(r.content);}});
Dialog.actionSheet({title:'添加球员',itemList:['手动填写','从常用球友选择'],success:r=>choose(r.tapIndex)});
```

`modal` 保留 `confirm/cancel/content` 回调格式；取消也触发 success，随后触发 complete。菜单/选择器取消触发 fail 和 complete。确认只执行一次，返回或卸载页面自动取消该页面的弹层，等待挂载和连续弹层通过队列处理。

输入框的 `value`（兼容 `content`）是初始输入文字，`message` 是输入框上方的说明；不要把说明文字预填成用户输入。长说明可以滚动。

```xml
<qy-picker title="先打哪个场" range="{{segments}}" range-key="name" value="{{first}}" bindchange="segment">
  <view class="select-field">{{segments[first].name}} ›</view>
</qy-picker>
<qy-picker title="选择比赛日期" mode="date" value="{{date}}" bindchange="dateChange">...</qy-picker>
<qy-picker title="选择出发时间" mode="time" value="{{time}}" bindchange="timeChange">...</qy-picker>
```

选择器 change.detail.value 保持原字段类型：列表为序号，日期为 YYYY-MM-DD，时间为 HH:mm。选中只是待确认值，取消不触发 change。disabled 和空选项不打开。日期支持 start/end。

微信强制授权、手机号授权、隐私合同、支付、系统设置、媒体/文件选择等界面保持平台原有行为。toast/loading 是短状态提示，不属于业务对话框。

自动检查覆盖：禁止原生业务弹窗回流、所有页面和地图模板有宿主、弹层排队、取消、跨页清理、输入值、日期、时间和原有业务回调。
