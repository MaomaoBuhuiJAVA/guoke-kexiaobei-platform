import type {Prisma} from "@prisma/client";
import {createScienceResourceIds} from "./science-resource-submit";
import {experimentBody,type ExperimentInput} from "./science-experiment";

/** Called only within the review transaction, after its pending-state claim succeeds. */
export async function publishExperiment(tx:Prisma.TransactionClient,value:ExperimentInput){
  const ids=createScienceResourceIds("EXP");
  const source=`审核实验/${value.title}`;
  const media=[
    ...(value.coverUrl?[{url:value.coverUrl,title:`${value.title} · 封面`,type:"图片资源"}]:[]),
    ...value.stepImages.map((image,index)=>({url:image.url,title:`操作步骤${String(index+1).padStart(2,"0")} · ${image.caption||value.title}`,type:"图片资源"})),
    ...(value.videoUrl?[{url:value.videoUrl,title:`${value.title} · 视频`,type:"视频资源"}]:[]),
    ...(value.documentUrl?[{url:value.documentUrl,title:`${value.title} · ${value.documentName||"教案"}`,type:"教案资源"}]:[]),
  ];
  await tx.scienceKnowledgeItem.create({data:{...ids,category:"科学实验",title:value.title,ageLabel:value.ageLabel,semester:value.ageLabel,topic:value.topic,author:value.author,sourceFile:source,sourcePage:"",allocationBasis:"教师投稿审核通过",tags:["科学实验",value.topic,value.ageLabel],ingestStatus:"审核通过",duplicateOf:"",knowledgeFile:source,imageCount:media.filter(m=>m.type==="图片资源").length,videoUrl:value.videoUrl,excerpt:value.description||value.objectives,body:experimentBody(value),sortOrder:0}});
  if(media.length)await tx.scienceKnowledgeResource.createMany({data:media.map((item,index)=>({id:`RESOURCE-${crypto.randomUUID().replaceAll("-","").slice(0,12)}`,knowledgeBaseId:ids.baseId,semester:value.ageLabel,resourceType:item.type,title:item.title,filePath:source,publicPath:item.type==="图片资源"?item.url:"",externalUrl:item.url,source,isPublic:true,sortOrder:index}))});
  return ids.id;
}
