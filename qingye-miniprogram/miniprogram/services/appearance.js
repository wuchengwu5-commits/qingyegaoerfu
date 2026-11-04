function appearance(value,par,completion){if(completion&&completion!=='holed_out')return {kind:'blank',label:'',delta:''};if(value==null)return {kind:'blank',label:'',delta:''};const d=value-par;return {kind:d<=-2?'eagle':d===-1?'birdie':d===0?'par':d===1?'bogey':'double',label:d===-2?'Eagle':d===-1?'Birdie':d===0?'Par':'',delta:d===0?'E':d>0?'+'+d:String(d)};}
module.exports={appearance};
