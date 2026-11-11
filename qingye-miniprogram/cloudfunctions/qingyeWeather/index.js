const cloud=require('wx-server-sdk'),{createProvider}=require('./provider');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const getWeather=createProvider();
exports.main=async(event={})=>{
 const context=cloud.getWXContext();
 if(context.APPID!=='wx771368adc305a848'||!context.OPENID)return {ok:false,code:'AUTH'};
 const {latitude,longitude}=event;
 if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||(latitude===0&&longitude===0))return {ok:false,code:'INVALID'};
 try{return {ok:true,data:await getWeather({latitude:Number(latitude.toFixed(2)),longitude:Number(longitude.toFixed(2))})};}
 catch(e){return {ok:false,code:['CONFIG_REQUIRED','STALE'].includes(e.code)?e.code:'UNAVAILABLE',message:'天气暂不可用'};}
};
