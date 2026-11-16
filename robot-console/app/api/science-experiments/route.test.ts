import {beforeEach,expect,it,vi} from "vitest";
vi.mock("@/lib/auth",()=>({getFreshSessionUser:vi.fn()}));
vi.mock("@/lib/science-write-access",()=>({authorizeScienceWrite:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{scienceExperimentSubmission:{create:vi.fn(),findMany:vi.fn(),count:vi.fn()}}}));
import {getFreshSessionUser} from "@/lib/auth";
import {authorizeScienceWrite} from "@/lib/science-write-access";
import {prisma} from "@/lib/prisma";
import {GET,POST} from "./route";
const teacher={id:"teacher",name:"教师",role:"USER" as const,accountType:"TEACHER" as const,identityVerified:true};
const input={title:"纸桥",ageLabel:"中班",topic:"力",author:"科学组",objectives:"比较承重",materials:"纸、积木",steps:"折纸并观察",principle:"形状影响承重",safety:"成人陪伴"};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getFreshSessionUser).mockResolvedValue(teacher);vi.mocked(authorizeScienceWrite).mockResolvedValue(null);vi.mocked(prisma.scienceExperimentSubmission.create).mockResolvedValue({id:"submission",status:"PENDING"} as never);vi.mocked(prisma.scienceExperimentSubmission.findMany).mockResolvedValue([]);vi.mocked(prisma.scienceExperimentSubmission.count).mockResolvedValue(0);});
const request=(body:unknown)=>new Request("http://localhost/api/science-experiments",{method:"POST",body:JSON.stringify(body)});
it("creates only a pending submission belonging to the session teacher",async()=>{
  const response=await POST(request({...input,ownerId:"forged",status:"APPROVED"}));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({submission:{status:"PENDING"}});
  expect(prisma.scienceExperimentSubmission.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({ownerId:"teacher",payload:expect.objectContaining({steps:"折纸并观察"})})}));
});
it("does not write incomplete experiments or denied requests",async()=>{
  expect((await POST(request({...input,steps:""}))).status).toBe(400);
  expect(prisma.scienceExperimentSubmission.create).not.toHaveBeenCalled();
  vi.mocked(authorizeScienceWrite).mockResolvedValue(Response.json({error:"denied"},{status:403}));
  expect((await POST(request(input))).status).toBe(403);
});
it("limits private submissions to their owner unless the actor has reviewer permission",async()=>{
  vi.mocked(getFreshSessionUser).mockResolvedValue({...teacher,id:"parent",accountType:"PARENT"});
  expect((await GET(new Request("http://localhost/api/science-experiments?review=1"))).status).toBe(403);
  expect((await GET(new Request("http://localhost/api/science-experiments?status=ALL"))).status).toBe(200);
  expect(prisma.scienceExperimentSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{ownerId:"parent"}}));
});
it("lets verified teachers review and denies unverified self-claimed teachers",async()=>{
  expect((await GET(new Request("http://localhost/api/science-experiments?review=1"))).status).toBe(200);
  vi.mocked(getFreshSessionUser).mockResolvedValue({...teacher,identityVerified:false});
  expect((await GET(new Request("http://localhost/api/science-experiments?review=1"))).status).toBe(403);
});
