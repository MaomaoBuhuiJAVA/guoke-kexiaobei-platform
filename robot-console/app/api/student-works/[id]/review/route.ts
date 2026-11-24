import {getFreshSessionUser} from "@/lib/auth";
import {canReviewSubmissions} from "@/lib/review-access";
import {prisma} from "@/lib/prisma";
import {PATCH as reviewSubmission} from "../../../admin/reviews/[id]/route";

/** Keep the legacy action on the same transaction and visibility rules as the review centre. */
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const actor=await getFreshSessionUser();
    if(!actor||!canReviewSubmissions(actor))return Response.json({error:"没有审核权限"},{status:403});
    let body;try{body=await request.json();}catch{return Response.json({error:"请求格式无效"},{status:400});}
    if(!body||typeof body!=="object"||Array.isArray(body))return Response.json({error:"请求格式无效"},{status:400});
    const {id}=await context.params;
    const work=await prisma.studentWork.findUnique({where:{id},select:{updatedAt:true}});
    if(!work)return Response.json({error:"作品不存在"},{status:404});
    const forwarded=new Request(request.url,{method:"PATCH",headers:request.headers,body:JSON.stringify({...body,expectedUpdatedAt:body.expectedUpdatedAt||work.updatedAt.toISOString()})});
    return reviewSubmission(forwarded,context);
  }catch{return Response.json({error:"审核服务暂时不可用，请稍后重试"},{status:503});}
}
