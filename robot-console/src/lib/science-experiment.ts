import {publicResourceUrl, SUBMIT_AGE_GROUPS} from "./science-resource-submit";
import {EXPERIMENT_FIELDS} from "./experiment-fields";

export type ExperimentInput = {
  title:string; ageLabel:string; topic:string; author:string; description:string;
  objectives:string; materials:string; steps:string; principle:string; safety:string;
  coverUrl:string; videoUrl:string; documentUrl:string; documentName:string;
  stepImages:Array<{url:string;caption:string}>;
};
export {EXPERIMENT_FIELDS} from "./experiment-fields";
export function validateExperiment(input:Record<string,unknown>): {ok:true;value:ExperimentInput}|{ok:false;error:string} {
  const value = {} as ExperimentInput;
  for(const key of ["title","ageLabel","topic","author","description","objectives","materials","steps","principle","safety","documentName"] as const){
    const raw=input[key];
    if(raw!==undefined && typeof raw!=="string")return {ok:false,error:"表单格式无效"};
    const text=(raw as string|undefined)?.trim()||"";
    if(text.length>(["steps","objectives","materials","principle","safety","description"].includes(key)?20000:160))return {ok:false,error:"填写内容过长"};
    value[key]=text;
  }
  if(!value.title || !value.topic || !value.author)return {ok:false,error:"请填写标题、科学主题和提供者"};
  if(!SUBMIT_AGE_GROUPS.includes(value.ageLabel as typeof SUBMIT_AGE_GROUPS[number]))return {ok:false,error:"请选择有效的年龄段"};
  for(const [key,label] of EXPERIMENT_FIELDS)if(!value[key])return {ok:false,error:`请填写${label}`};
  for(const key of ["coverUrl","videoUrl","documentUrl"] as const){
    value[key]=publicResourceUrl(input[key]);
    if(input[key]&&!value[key])return {ok:false,error:"附件地址必须是 HTTPS 地址或站内路径"};
  }
  const images=input.stepImages??[];
  if(!Array.isArray(images)||images.length>12)return {ok:false,error:"步骤图片最多12张"};
  value.stepImages=[];
  for(const image of images){
    if(!image||typeof image!=="object"||typeof image.url!=="string"||typeof image.caption!=="string"||image.caption.length>200)return {ok:false,error:"步骤图片信息无效"};
    const url=publicResourceUrl(image.url);
    if(!url)return {ok:false,error:"步骤图片地址无效"};
    value.stepImages.push({url,caption:image.caption.trim()});
  }
  return {ok:true,value};
}
export function experimentBody(value:ExperimentInput){
  return EXPERIMENT_FIELDS.map(([key,label])=>`## ${label}\n${value[key]}`).join("\n\n");
}
export function experimentMedia(value:ExperimentInput){
  return [value.coverUrl,value.videoUrl,value.documentUrl,...value.stepImages.map(image=>image.url)].filter(Boolean);
}
