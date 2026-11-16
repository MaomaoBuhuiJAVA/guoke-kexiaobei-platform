export type ScienceSocialStats={views:number;likes:number;comments:number;liked:boolean};
export const EMPTY_SCIENCE_STATS:ScienceSocialStats={views:0,likes:0,comments:0,liked:false};
/** Small local baseline, intentionally explicit; this is not a comprehensive moderation service. */
const prohibited=[/傻[逼比屄]|煞笔|沙比|妈的|操你|草你|他妈|你妈死|狗日|狗杂种|贱人|去死|死全家|杀了你|弄死/u,/色情|裸聊|约炮|援交|性交易|黄色网站|成人视频|强奸|迷奸|嫖娼|卖淫/u,/代开发票|刷单返利|加微信|加微|加v[信x]?|博彩|赌博|买卖毒品/u,/(?:^|[^a-z])(?:sb|fuck|shit|bitch)(?:$|[^a-z])/iu];
export function validateScienceComment(value:unknown):{ok:true;body:string}|{ok:false;error:string}{
  if(typeof value!=="string")return {ok:false,error:"请输入评论内容"};
  const body=value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff]/gu,"").trim();
  if(!body||Array.from(body).length>500)return {ok:false,error:"评论需为1至500个字"};
  const normalized=body.normalize("NFKC").toLowerCase();
  const compact=normalized.replace(/[\s\p{P}\p{S}]/gu,"");
  if(prohibited.some(pattern=>pattern.test(normalized)||pattern.test(compact))||/f[\s\p{P}\p{S}]*u[\s\p{P}\p{S}]*c[\s\p{P}\p{S}]*k/iu.test(normalized))return {ok:false,error:"评论包含不适宜内容，请文明交流后重新发送"};
  return {ok:true,body};
}
export function sortSciencePopularity<T extends {id:string}>(items:T[],stats:Record<string,{views:number;likes:number}>,by:"views"|"likes"="views"):T[]{
  const secondary=by==="views"?"likes":"views";
  return items.map((item,index)=>({item,index})).sort((a,b)=>(stats[b.item.id]?.[by]||0)-(stats[a.item.id]?.[by]||0)||(stats[b.item.id]?.[secondary]||0)-(stats[a.item.id]?.[secondary]||0)||a.index-b.index).map(entry=>entry.item);
}
