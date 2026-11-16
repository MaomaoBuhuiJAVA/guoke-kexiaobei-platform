import {getFreshSessionUser} from "@/lib/auth";
import {authorizeScienceWrite} from "@/lib/science-write-access";
import {canReviewSubmissions} from "@/lib/review-access";
import {validateExperiment,experimentMedia} from "@/lib/science-experiment";
import {prisma} from "@/lib/prisma";

const headers={"Cache-Control":"private, no-store"};
export async function POST(request:Request){
  const denied=await authorizeScienceWrite(request,"experiment-create",10);
  if(denied)return denied;
  try{
    const actor=await getFreshSessionUser();
    if(!actor)return Response.json({error:"请先登录"},{status:401,headers});
    // Bound chunked JSON as well as requests with Content-Length.
    const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024){await reader.cancel();return Response.json({error:"提交内容过长"},{status:413,headers});}chunks.push(value);}}finally{reader.releaseLock();}
    let input:unknown;
    try{input=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return Response.json({error:"表单格式无效"},{status:400,headers});}
    if(!input||typeof input!=="object"||Array.isArray(input))return Response.json({error:"表单格式无效"},{status:400,headers});
    const validation=validateExperiment(input as Record<string,unknown>);
    if(!validation.ok)return Response.json({error:validation.error},{status:400,headers});
    const submission=await prisma.scienceExperimentSubmission.create({data:{title:validation.value.title,ownerId:actor.id,payload:validation.value,mediaUrls:experimentMedia(validation.value)},select:{id:true,status:true}});
    return Response.json({submission,message:"实验已提交审核，通过后会在资源库公开。"},{status:201,headers});
  }catch{return Response.json({error:"实验暂时无法提交，请稍后重试"},{status:503,headers});}
}
export async function GET(request:Request){
  try{
    const actor=await getFreshSessionUser();
    if(!actor)return Response.json({error:"请先登录"},{status:401,headers});
    const params=new URL(request.url).searchParams;
    const review=params.get("review")==="1";
    if(review&&!canReviewSubmissions(actor))return Response.json({error:"需要已核验教师或管理员审核权限"},{status:403,headers});
    const status=params.get("status")||"PENDING",page=Number(params.get("page")||1);
    if(!["PENDING","APPROVED","REJECTED","ALL"].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000)return Response.json({error:"筛选条件无效"},{status:400,headers});
    const where={...(!review?{ownerId:actor.id}:{}),...(status!=="ALL"?{status:status as "PENDING"|"APPROVED"|"REJECTED"}:{})};
    const [submissions,total]=await Promise.all([
      prisma.scienceExperimentSubmission.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:12,skip:(page-1)*12,select:{id:true,title:true,payload:true,status:true,reviewNote:true,publishedItemId:true,createdAt:true,updatedAt:true,reviewedAt:true,owner:{select:{name:true}},reviewer:{select:{name:true}}}}),
      prisma.scienceExperimentSubmission.count({where}),
    ]);
    return Response.json({submissions,total,page,pageSize:12},{headers});
  }catch{return Response.json({error:"实验审核列表暂时无法加载"},{status:503,headers});}
}
