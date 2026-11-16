import {getFreshSessionUser} from "@/lib/auth";
import {canReviewSubmissions} from "@/lib/review-access";
import {checkAuthOrigin} from "@/lib/auth-request";
import {validateExperiment} from "@/lib/science-experiment";
import {publishExperiment} from "@/lib/publish-experiment";
import {prisma} from "@/lib/prisma";
import {revalidateTag} from "next/cache";
class Conflict extends Error{constructor(message:string,readonly status:number){super(message);}}
const headers={"Cache-Control":"private, no-store"};
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{checkAuthOrigin(request);}catch{return Response.json({error:"请从本网站发起审核"},{status:403,headers});}
  try{
    const actor=await getFreshSessionUser();
    if(!actor)return Response.json({error:"请先登录"},{status:401,headers});
    if(!canReviewSubmissions(actor))return Response.json({error:"需要已核验教师或管理员审核权限"},{status:403,headers});
    let body;try{body=await request.json();}catch{return Response.json({error:"审核请求格式无效"},{status:400,headers});}
    if(!body||!["approve","reject"].includes(body.action)||typeof body.expectedUpdatedAt!=="string"||!Number.isFinite(new Date(body.expectedUpdatedAt).getTime()))return Response.json({error:"请刷新投稿后重新审核"},{status:400,headers});
    if(body.reviewNote!==undefined&&typeof body.reviewNote!=="string")return Response.json({error:"审核意见格式无效"},{status:400,headers});
    const note=(body.reviewNote||"").trim();
    if(note.length>2000||body.action==="reject"&&!note)return Response.json({error:"请填写有效的审核意见，退回时必须说明原因"},{status:400,headers});
    const {id}=await params;
    const status=body.action==="approve"?"APPROVED":"REJECTED";
    const publishedItemId=await prisma.$transaction(async tx=>{
      const submission=await tx.scienceExperimentSubmission.findUnique({where:{id}});
      if(!submission)throw new Conflict("实验投稿不存在",404);
      if(submission.status!=="PENDING")throw new Conflict("该实验已经审核，请刷新列表",409);
      const claim=await tx.scienceExperimentSubmission.updateMany({where:{id,status:"PENDING",updatedAt:new Date(body.expectedUpdatedAt)},data:{status,reviewNote:note||null,reviewedBy:actor.id,reviewedAt:new Date()}});
      if(claim.count!==1)throw new Conflict("投稿或审核状态已更新，请刷新后重试",409);
      if(status==="REJECTED")return null;
      const validation=validateExperiment(submission.payload as Record<string,unknown>);
      if(!validation.ok)throw new Conflict("实验内容不完整，请退回修改",400);
      const itemId=await publishExperiment(tx,validation.value);
      await tx.scienceExperimentSubmission.update({where:{id},data:{publishedItemId:itemId}});
      return itemId;
    });
    if(publishedItemId)revalidateTag("science-knowledge",{expire:0});
    return Response.json({ok:true,status,publishedItemId},{headers});
  }catch(error){return Response.json({error:error instanceof Conflict?error.message:"审核未完成，请稍后重试"},{status:error instanceof Conflict?error.status:503,headers});}
}
