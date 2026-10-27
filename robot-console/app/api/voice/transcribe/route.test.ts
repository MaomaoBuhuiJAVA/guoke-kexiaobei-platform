import {afterEach, beforeEach, expect, it, vi} from "vitest";
vi.mock("@/lib/qwen-asr", async importOriginal => {
  const original=await importOriginal<typeof import("@/lib/qwen-asr")>();
  return {...original,recognizeQwenSpeech:vi.fn()};
});
import {POST} from "./route";
import {recognizeQwenSpeech} from "@/lib/qwen-asr";
function wav() {
  const b=Buffer.alloc(3244);b.write("RIFF");b.writeUInt32LE(3236,4);b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(3200,40);return b;
}
let ip=0;
function request(body:BodyInit=wav(),headers:Record<string,string>={}) {
  return new Request("https://guokeey.cn/api/voice/transcribe",{method:"POST",body,headers:{"Content-Type":"audio/wav","Origin":"https://guokeey.cn","x-real-ip":"test-"+(++ip),...headers}});
}
beforeEach(()=>{vi.mocked(recognizeQwenSpeech).mockResolvedValue("磁铁为什么能吸铁？");});
afterEach(()=>vi.clearAllMocks());
it("accepts an in-memory recording and returns no-store text",async()=>{
  const response=await POST(request());
  expect(response.status).toBe(200);expect(await response.json()).toEqual({text:"磁铁为什么能吸铁？"});
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("rejects cross-site, malformed, and oversized uploads before contacting the provider",async()=>{
  expect((await POST(request(wav(),{Origin:"https://other.example"}))).status).toBe(403);
  expect((await POST(request("invalid audio"))).status).toBe(400);
  expect((await POST(request(wav(),{"Content-Length":"10000000"}))).status).toBe(413);
  expect((await POST(request(new Uint8Array(960045)))).status).toBe(413);
  expect(recognizeQwenSpeech).not.toHaveBeenCalled();
});
it("does not leak provider errors",async()=>{
  vi.mocked(recognizeQwenSpeech).mockRejectedValue(new Error("private credential detail"));
  const response=await POST(request());
  expect(response.status).toBe(503);
  const result=await response.json();
  expect(JSON.stringify(result)).not.toContain("private credential");
});
