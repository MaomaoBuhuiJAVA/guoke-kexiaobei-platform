import {beforeEach,expect,it,vi} from "vitest";
const {tx}=vi.hoisted(()=>({tx:{studentWork:{findUnique:vi.fn(),updateMany:vi.fn(),update:vi.fn()},knowledgeDocument:{create:vi.fn()}}}));
vi.mock("@/lib/auth",()=>({getFreshSessionUser:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{studentWork:{findUnique:vi.fn()},$transaction:vi.fn()}}));
import {getFreshSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {POST} from "./route";
const reviewer={id:"teacher",name:"教师",role:"USER" as const,accountType:"TEACHER" as const,identityVerified:true,phoneVerified:true,phone:"19900000001"};
const context={params:Promise.resolve({id:"work"})};
const request=(body:unknown)=>new Request("http://localhost/api/student-works/work/review",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("REVIEW_TEACHER_PHONES","19900000001");vi.mocked(getFreshSessionUser).mockResolvedValue(reviewer);vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({updatedAt:new Date("2026-11-16T00:00:00Z")} as never);vi.mocked(prisma.$transaction).mockImplementation(async callback=>(callback as unknown as (client:typeof tx)=>Promise<unknown>)(tx) as never);tx.studentWork.findUnique.mockResolvedValue({id:"work",status:"PENDING",title:"纸桥",mediaUrl:"/file.png",mimeType:"image/png"});tx.studentWork.updateMany.mockResolvedValue({count:1});tx.knowledgeDocument.create.mockResolvedValue({id:"doc"});});
it("lets verified teachers use the legacy action through the protected review transaction",async()=>{
  expect((await POST(request({action:"approve",visibility:"public",addToLibrary:true}),context)).status).toBe(200);
  expect(tx.studentWork.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({reviewedBy:"teacher",status:"APPROVED"})}));
});
it("does not publish internal work or accept a rejection without a reason",async()=>{
  expect((await POST(request({action:"approve",visibility:"teacher",addToLibrary:true}),context)).status).toBe(400);
  expect((await POST(request({action:"reject"}),context)).status).toBe(400);
  expect(tx.knowledgeDocument.create).not.toHaveBeenCalled();
});
it("rejects already reviewed work and concurrent updates",async()=>{
  tx.studentWork.findUnique.mockResolvedValue({status:"APPROVED"});expect((await POST(request({action:"approve"}),context)).status).toBe(409);
  tx.studentWork.findUnique.mockResolvedValue({status:"PENDING"});tx.studentWork.updateMany.mockResolvedValue({count:0});expect((await POST(request({action:"approve"}),context)).status).toBe(409);
});
it("denies ordinary accounts before reading or changing submissions",async()=>{
  vi.mocked(getFreshSessionUser).mockResolvedValue({...reviewer,accountType:"PARENT"});
  expect((await POST(request({action:"approve"}),context)).status).toBe(403);expect(prisma.studentWork.findUnique).not.toHaveBeenCalled();
});
