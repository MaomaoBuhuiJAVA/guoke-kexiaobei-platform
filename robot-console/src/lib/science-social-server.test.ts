import {beforeEach,expect,it,vi} from "vitest";
const {tx}=vi.hoisted(()=>({tx:{scienceResourceStats:{upsert:vi.fn(),update:vi.fn()},scienceResourceLike:{createMany:vi.fn(),deleteMany:vi.fn()},scienceResourceView:{createMany:vi.fn()},scienceResourceComment:{create:vi.fn(),deleteMany:vi.fn()}}}));
vi.mock("./auth",()=>({getFreshSessionUser:vi.fn()}));
vi.mock("./science-data",()=>({getScienceKnowledgeSummaries:vi.fn()}));
vi.mock("./prisma",()=>({prisma:{$transaction:vi.fn(),scienceResourceStats:{findMany:vi.fn()},scienceResourceLike:{findMany:vi.fn()},scienceResourceComment:{findUnique:vi.fn(),findMany:vi.fn(),count:vi.fn()}}}));
import {getFreshSessionUser} from "./auth";
import {getScienceKnowledgeSummaries} from "./science-data";
import {prisma} from "./prisma";
import {writeScienceSocial,listScienceSocial,getScienceComments} from "./science-social-server";
const id="POEM-123456abcdef";
const actor={id:"user-1",name:"参与者",role:"USER" as const,accountType:"PARENT" as const};
const request=(body:unknown,cookie?:string)=>new Request(`https://guokeey.cn/api/science-social/${id}`,{method:"POST",headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();vi.mocked(getFreshSessionUser).mockResolvedValue(actor);
  vi.mocked(getScienceKnowledgeSummaries).mockResolvedValue([{id,title:"风",category:"科学诗"},{id:"STORY-abcdef123456",title:"风的故事",category:"科学故事"}] as never);
  vi.mocked(prisma.$transaction).mockImplementation(async callback=>(callback as unknown as (client:typeof tx)=>Promise<unknown>)(tx) as never);
  tx.scienceResourceStats.update.mockResolvedValue({views:1,likes:1,comments:1});tx.scienceResourceLike.createMany.mockResolvedValue({count:1});tx.scienceResourceLike.deleteMany.mockResolvedValue({count:1});tx.scienceResourceView.createMany.mockResolvedValue({count:1});
});
it("requires a session for likes and comments before writing",async()=>{
  vi.mocked(getFreshSessionUser).mockResolvedValue(null);
  expect((await writeScienceSocial(request({liked:true}),id,"like")).status).toBe(401);
  expect((await writeScienceSocial(request({action:"comment",body:"喜欢"}),id,"post")).status).toBe(401);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("does not increment likes twice or decrement a missing like",async()=>{
  tx.scienceResourceLike.createMany.mockResolvedValue({count:0});
  expect((await writeScienceSocial(request({liked:true}),id,"like")).status).toBe(200);
  expect(tx.scienceResourceStats.update).toHaveBeenLastCalledWith({where:{itemId:id},data:{}});
  tx.scienceResourceLike.deleteMany.mockResolvedValue({count:0});
  expect((await writeScienceSocial(request({liked:false}),id,"like")).status).toBe(200);
  expect(tx.scienceResourceStats.update).toHaveBeenLastCalledWith({where:{itemId:id},data:{}});
});
it("records repeat views with the same signed visitor and time-window identity",async()=>{
  const first=await writeScienceSocial(request({action:"view"}),id,"post");expect(first.status).toBe(200);
  const cookie=first.headers.get("set-cookie")!.split(";")[0];
  const identity=tx.scienceResourceView.createMany.mock.calls[0][0].data[0];
  tx.scienceResourceView.createMany.mockResolvedValue({count:0});
  const repeated=await writeScienceSocial(request({action:"view"},cookie),id,"post");expect(repeated.status).toBe(200);
  expect(tx.scienceResourceView.createMany.mock.calls[1][0].data[0]).toEqual(identity);
  expect(tx.scienceResourceStats.update).toHaveBeenLastCalledWith({where:{itemId:id},data:{}});
});
it("rejects prohibited comments, malformed input and cross-site requests before writing",async()=>{
  expect((await writeScienceSocial(request({action:"comment",body:"傻　逼"}),id,"post")).status).toBe(400);
  const cross=request({liked:true});cross.headers.set("Origin","https://example.com");expect((await writeScienceSocial(cross,id,"like")).status).toBe(403);
  expect((await writeScienceSocial(request({liked:"true"}),id,"like")).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("refuses unknown items instead of creating fabricated leaderboard entries",async()=>{
  expect((await writeScienceSocial(request({action:"view"}),"POEM-ffffffffffff","post")).status).toBe(404);expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("returns only the requested category ranked by real likes",async()=>{
  vi.mocked(prisma.scienceResourceStats.findMany).mockResolvedValue([{itemId:id,views:9,likes:2,comments:0},{itemId:"STORY-abcdef123456",views:2,likes:10,comments:0}] as never);
  vi.mocked(prisma.scienceResourceLike.findMany).mockResolvedValue([]);
  const response=await listScienceSocial(new Request("https://guokeey.cn/api/science-social?category="+encodeURIComponent("科学诗")));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({items:[{id,title:"风",rank:1,stats:{likes:2,views:9}}]});
});
it("includes public author attribution for exactly the first ten ranked resources",async()=>{
  vi.mocked(getScienceKnowledgeSummaries).mockResolvedValue(Array.from({length:12},(_,index)=>({id:`POEM-${index.toString(16).padStart(12,"0")}`,title:`诗${index}`,category:"科学诗",author:`教师${index}`})) as never);
  vi.mocked(prisma.scienceResourceStats.findMany).mockResolvedValue([]);vi.mocked(prisma.scienceResourceLike.findMany).mockResolvedValue([]);
  const data=await (await listScienceSocial(new Request("https://guokeey.cn/api/science-social?category="+encodeURIComponent("科学诗")))).json();
  expect(data.items[0]).toMatchObject({author:"教师0"});expect(data.items[9]).toMatchObject({author:"教师9"});
  expect(data.items[10]).not.toHaveProperty("author");
});
it("does not let another ordinary user delete someone else's comment",async()=>{
  vi.mocked(prisma.scienceResourceComment.findUnique).mockResolvedValue({itemId:id,authorId:"another"} as never);
  expect((await writeScienceSocial(request({commentId:"comment"}),id,"delete")).status).toBe(403);expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("publishes comments without exposing account identifiers or contact details",async()=>{
  vi.mocked(prisma.scienceResourceComment.findMany).mockResolvedValue([{id:"comment",body:"我发现风会推动纸船",createdAt:new Date(),authorId:"another",author:{role:"USER",accountType:"TEACHER"}}] as never);
  vi.mocked(prisma.scienceResourceComment.count).mockResolvedValue(1);
  const data=await (await getScienceComments(new Request("https://guokeey.cn/api/science-social/"+id),id)).json();
  expect(data.comments[0]).toMatchObject({authorName:"教师",canDelete:false});expect(JSON.stringify(data)).not.toContain("another");
});
