Page({contact(){wx.makePhoneCall({phoneNumber:'18521597226'});},feedback(){wx.navigateTo({url:'/pages/feedback/index'});},weatherSource(){wx.setClipboardData({data:'https://www.qweather.com'});}});
