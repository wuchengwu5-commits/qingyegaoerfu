const B=require('../../services/backgrounds');
Component({data:{src:B.FALLBACK,original:false},lifetimes:{attached(){this.off=B.watch(s=>this.setData({src:s.src,original:false}));B.apply();},detached(){if(this.off)this.off();}},pageLifetimes:{show(){B.apply();}},methods:{failed(){B.imageFailed();}}});
