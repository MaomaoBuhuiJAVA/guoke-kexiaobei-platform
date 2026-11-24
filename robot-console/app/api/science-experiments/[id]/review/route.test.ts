import {beforeEach,expect,it,vi} from "vitest";
const {tx}=vi.hoisted(()=>({tx:{scienceExperimentSubmission:{findUnique:vi.fn(),updateMany:vi.fn(),update:vi.fn()},scienceKnowledgeItem:{create:vi.fn()},scienceKnowledgeResource:{createMany:vi.fn()}}}));
vi.mock("@/lib/prisma",()=>({prisma:{$transaction:vi.fn()}}));
vi.mock("@/lib/auth",()=>({getFreshSessionUser:vi.fn()}));
vi.mock("next/cache",()=>({revalidateTag:vi.fn()}));
import {prisma} from "@/lib/prisma";
import {getFreshSessionUser} from "@/lib/auth";
import {PATCH} from "./route";
const teacher={id:"reviewer",name:"审核教师",role:"USER" as const,accountType:"TEACHER" as const,identityVerified:true,phoneVerified:true,phone:"19900000001"};
const input={title:"纸桥",ageLabel:"中班",topic:"力",author:"科学组",objectives:"比较承重",materials:"纸、积木",steps:"折纸并观察",principle:"形状影响承重",safety:"成人陪伴",stepImages:[{url:"/images/step.png",caption:"折纸"}]};
const params={params:Promise.resolve({id:"submission"})};
const request=(action="approve",note="",version="2026-11-16T00:00:00.000Z")=>new Request("http://localhost/api/science-experiments/submission/review",{method:"PATCH",body:JSON.stringify({action,reviewNote:note,expectedUpdatedAt:version})});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("REVIEW_TEACHER_PHONES","19900000001");vi.mocked(getFreshSessionUser).mockResolvedValue(teacher);vi.mocked(prisma.$transaction).mockImplementation(async callback=>(callback as unknown as (client:typeof tx)=>Promise<unknown>)(tx) as never);tx.scienceExperimentSubmission.findUnique.mockResolvedValue({id:"submission",status:"PENDING",payload:input});tx.scienceExperimentSubmission.updateMany.mockResolvedValue({count:1});});
it("publishes the complete experiment and ordered images only on approval",async()=>{
  const response=await PATCH(request(),params);expect(response.status).toBe(200);
  const data=await response.json();expect(data.publishedItemId).toMatch(/^EXP-[a-f0-9]{12}$/u);
  expect(tx.scienceKnowledgeItem.create).toHaveBeenCalledWith({data:expect.objectContaining({category:"科学实验",body:expect.stringContaining("## 安全提醒\n成人陪伴")})});
  expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith({data:expect.arrayContaining([expect.objectContaining({title:"操作步骤01 · 折纸",isPublic:true,sortOrder:0})])});
  expect(tx.scienceExperimentSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"APPROVED",reviewedBy:"reviewer"})}));
});
it("returns rejected experiments with a reason without publishing anything",async()=>{
  expect((await PATCH(request("reject"),params)).status).toBe(400);
  expect((await PATCH(request("reject","请补充步骤"),params)).status).toBe(200);
  expect(tx.scienceKnowledgeItem.create).not.toHaveBeenCalled();
});
it("publishes videos as playable URLs rather than QR-code images and preserves the teaching attachment",async()=>{
  tx.scienceExperimentSubmission.findUnique.mockResolvedValue({id:"submission",status:"PENDING",payload:{...input,coverUrl:"/images/cover.png",videoUrl:"/media/demo.mp4",documentUrl:"/media/lesson.pdf",documentName:"教案.pdf"}});
  expect((await PATCH(request(),params)).status).toBe(200);
  expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith({data:expect.arrayContaining([expect.objectContaining({resourceType:"视频资源",publicPath:"",externalUrl:"/media/demo.mp4"}),expect.objectContaining({resourceType:"教案资源",externalUrl:"/media/lesson.pdf"})])});
});
it("prevents duplicate publication and stale review races",async()=>{
  tx.scienceExperimentSubmission.findUnique.mockResolvedValue({status:"APPROVED"});
  expect((await PATCH(request(),params)).status).toBe(409);
  tx.scienceExperimentSubmission.findUnique.mockResolvedValue({status:"PENDING",payload:input});
  tx.scienceExperimentSubmission.updateMany.mockResolvedValue({count:0});
  expect((await PATCH(request(),params)).status).toBe(409);
  expect(tx.scienceKnowledgeItem.create).not.toHaveBeenCalled();
});
it("refuses parents, unverified teachers and cross-site requests before writing",async()=>{
  for(const actor of [{...teacher,accountType:"PARENT" as const},{...teacher,identityVerified:false}]){vi.mocked(getFreshSessionUser).mockResolvedValue(actor);expect((await PATCH(request(),params)).status).toBe(403);}
  const cross=request();cross.headers.set("Origin","https://example.com");expect((await PATCH(cross,params)).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
