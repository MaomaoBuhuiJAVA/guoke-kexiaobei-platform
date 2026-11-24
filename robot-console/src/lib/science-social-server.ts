import {prisma} from "./prisma";
import {getScienceKnowledgeSummaries} from "./science-data";
import {getFreshSessionUser} from "./auth";
import {checkAuthOrigin,readAuthJson} from "./auth-request";
import {checkPublicRateLimit} from "./public-rate-limit";
import {canManageScience} from "./science-access";
import {validateScienceComment,sortSciencePopularity,scienceRankingAuthor,type ScienceSocialStats} from "./science-social";
import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";

export const socialHeaders={"Cache-Control":"private, no-store"};
export const socialReply=(body:unknown,status=200)=>Response.json(body,{status,headers:socialHeaders});
export async function validSocialItem(id:string){
  if(!/^(?:EXP|POEM|STORY)-[a-f0-9]{12}$/u.test(id))return undefined;
  return (await getScienceKnowledgeSummaries()).find(item=>item.id===id);
}
export async function socialSnapshot(userId?:string){
  const [items,rows,liked]=await Promise.all([getScienceKnowledgeSummaries(),prisma.scienceResourceStats.findMany(),userId?prisma.scienceResourceLike.findMany({where:{userId},select:{itemId:true}}):[]]);
  const byId=new Map(rows.map(row=>[row.itemId,row]));const likedIds=new Set(liked.map(row=>row.itemId));
  const stats:Record<string,ScienceSocialStats>={};
  for(const item of items){const row=byId.get(item.id);stats[item.id]={views:row?.views||0,likes:row?.likes||0,comments:row?.comments||0,liked:likedIds.has(item.id)};}
  return {items,stats};
}
const zeroStats=(itemId:string)=>({itemId,views:0,likes:0,comments:0});
const safeStats=(row:{views:number;likes:number;comments:number},liked=false)=>({views:row.views,likes:row.likes,comments:row.comments,liked});
function limited(request:Request,identity:string,action:string,limit:number){return checkPublicRateLimit(new Request(request.url,{headers:{"x-forwarded-for":identity}}),`science-social:${action}`,limit);}
function visitorIdentity(request:Request){
  const key=process.env.AUTH_SECRET||"local-only-science-social";
  const sign=(text:string)=>createHmac("sha256",key).update(text).digest("hex");
  const raw=request.headers.get("cookie")?.split(";").map(part=>part.trim()).find(part=>part.startsWith("gk_science_visitor="))?.slice(19)||"";
  const parts=raw.split(".");let id=parts[0];
  const signature=parts[1]||"";const expected=sign(id||"");
  const valid=/^[a-f0-9-]{36}$/u.test(id||"")&&/^[a-f0-9]{64}$/u.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
  if(!valid)id=randomUUID();
  return {hash:sign(id),cookie:valid?undefined:`gk_science_visitor=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol==="https:"||request.headers.get("x-forwarded-proto")==="https"?"; Secure":""}`};
}
export async function listScienceSocial(request:Request){
  try{
    const actor=await getFreshSessionUser();const snapshot=await socialSnapshot(actor?.id);
    const category=new URL(request.url).searchParams.get("category");
    if(category!==null){
      if(!["科学诗","科学故事","科学实验"].includes(category))return socialReply({error:"请选择有效的排行榜分类"},400);
      const items=sortSciencePopularity(snapshot.items.filter(item=>item.category===category),snapshot.stats,"likes");
      return socialReply({items:items.map((item,index)=>({id:item.id,title:item.title,ageLabel:item.ageLabel,category:item.category,topic:item.topic,...(index<10?{author:scienceRankingAuthor(item)}:{}),rank:index+1,href:`/lab?item=${item.id}`,stats:snapshot.stats[item.id]}))});
    }
    return socialReply({stats:snapshot.stats,loggedIn:Boolean(actor)});
  }catch{return socialReply({error:"互动数据暂时无法加载，请稍后重试"},503);}
}
export async function getScienceComments(request:Request,id:string){
  try{
    if(!await validSocialItem(id))return socialReply({error:"资料不存在"},404);
    const params=new URL(request.url).searchParams;const page=Number(params.get("page")||1);
    if(!Number.isSafeInteger(page)||page<1||page>10000)return socialReply({error:"页码无效"},400);
    const actor=await getFreshSessionUser();
    const [comments,total]=await Promise.all([
      prisma.scienceResourceComment.findMany({where:{itemId:id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:20,skip:(page-1)*20,select:{id:true,body:true,createdAt:true,authorId:true,author:{select:{role:true,accountType:true}}}}),
      prisma.scienceResourceComment.count({where:{itemId:id}}),
    ]);
    return socialReply({comments:comments.map(comment=>({id:comment.id,body:comment.body,createdAt:comment.createdAt,authorName:comment.author.role==="ADMIN"?"管理员":comment.author.accountType==="TEACHER"?"教师":"参与者",canDelete:Boolean(actor&&(actor.id===comment.authorId||canManageScience(actor)))})),total,page,pageSize:20});
  }catch{return socialReply({error:"评论暂时无法加载，请稍后重试"},503);}
}
export async function writeScienceSocial(request:Request,id:string,operation:"post"|"like"|"delete"){
  try{checkAuthOrigin(request);}catch{return socialReply({error:"请从本网站操作"},403);}
  try{
    if(!await validSocialItem(id))return socialReply({error:"资料不存在"},404);
    let body:Record<string,unknown>;try{body=await readAuthJson(request);}catch{return socialReply({error:"请求格式无效或内容过长"},400);}
    if(operation==="post"&&body.action==="view"){
      const networkLimit=checkPublicRateLimit(request,"science-social:view-network",180);if(networkLimit)return networkLimit;
      const visitor=visitorIdentity(request);const limit=limited(request,visitor.hash,"view",60);if(limit)return limit;
      const windowStart=new Date(Math.floor(Date.now()/1800000)*1800000);
      const stats=await prisma.$transaction(async tx=>{
        await tx.scienceResourceStats.upsert({where:{itemId:id},create:zeroStats(id),update:{}});
        const added=await tx.scienceResourceView.createMany({data:[{itemId:id,visitorHash:visitor.hash,windowStart}],skipDuplicates:true});
        return tx.scienceResourceStats.update({where:{itemId:id},data:added.count?{views:{increment:1}}:{}});
      });
      const response=socialReply({stats:safeStats(stats)});if(visitor.cookie)response.headers.set("Set-Cookie",visitor.cookie);return response;
    }
    const actor=await getFreshSessionUser();if(!actor)return socialReply({error:"请先登录后点赞或评论"},401);
    const throttle=limited(request,actor.id,operation,operation==="post"?10:60);if(throttle)return throttle;
    if(operation==="like"){
      if(typeof body.liked!=="boolean")return socialReply({error:"点赞状态无效"},400);
      const liked=body.liked;
      const stats=await prisma.$transaction(async tx=>{
        await tx.scienceResourceStats.upsert({where:{itemId:id},create:zeroStats(id),update:{}});
        const change=liked?await tx.scienceResourceLike.createMany({data:[{itemId:id,userId:actor.id}],skipDuplicates:true}):await tx.scienceResourceLike.deleteMany({where:{itemId:id,userId:actor.id}});
        return tx.scienceResourceStats.update({where:{itemId:id},data:change.count?{likes:{increment:liked?1:-1}}:{}});
      });return socialReply({stats:safeStats(stats,liked)});
    }
    if(operation==="delete"){
      if(typeof body.commentId!=="string"||body.commentId.length>100)return socialReply({error:"评论信息无效"},400);
      const comment=await prisma.scienceResourceComment.findUnique({where:{id:body.commentId},select:{authorId:true,itemId:true}});
      if(!comment||comment.itemId!==id)return socialReply({error:"评论不存在"},404);
      if(actor.id!==comment.authorId&&!canManageScience(actor))return socialReply({error:"没有删除权限"},403);
      await prisma.$transaction(async tx=>{const removed=await tx.scienceResourceComment.deleteMany({where:{id:body.commentId as string,itemId:id}});if(removed.count)await tx.scienceResourceStats.update({where:{itemId:id},data:{comments:{decrement:1}}});});
      return socialReply({ok:true});
    }
    if(body.action!=="comment")return socialReply({error:"操作无效"},400);
    const validated=validateScienceComment(body.body);if(!validated.ok)return socialReply({error:validated.error},400);
    const comment=await prisma.$transaction(async tx=>{
      await tx.scienceResourceStats.upsert({where:{itemId:id},create:zeroStats(id),update:{}});
      const created=await tx.scienceResourceComment.create({data:{itemId:id,authorId:actor.id,body:validated.body},select:{id:true,body:true,createdAt:true}});
      await tx.scienceResourceStats.update({where:{itemId:id},data:{comments:{increment:1}}});return created;
    });
    return socialReply({comment:{...comment,authorName:actor.role==="ADMIN"?"管理员":actor.accountType==="TEACHER"?"教师":"参与者",canDelete:true}},201);
  }catch{return socialReply({error:"操作暂时未完成，请稍后重试"},503);}
}
