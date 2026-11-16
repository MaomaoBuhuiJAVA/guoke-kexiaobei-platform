import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {GET, POST} from "./route";

const offer = "v=0\r\no=- 123 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n";
const request = (body = offer, headers: Record<string,string> = {}) => new Request("https://guokeey.cn/api/video-call/session", {
  method: "POST", headers: {"Content-Type": "application/sdp", Origin: "https://guokeey.cn", "x-forwarded-for": String(Math.random()), ...headers}, body,
});
beforeEach(() => {
  vi.stubEnv("QWEN_REALTIME_API_KEY", "private-test-key");
  vi.stubEnv("QWEN_REALTIME_WORKSPACE_ID", "workspace-123");
  vi.stubEnv("QWEN_REALTIME_REGION", "cn-beijing");
});
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});
describe("video session proxy", () => {
  it("reports unavailable without a real-time workspace", async () => {
    vi.stubEnv("QWEN_REALTIME_WORKSPACE_ID", ""); vi.stubEnv("DASHSCOPE_WORKSPACE_ID", "");
    expect(await (await GET()).json()).toMatchObject({available: false});
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects cross-origin, non-SDP and oversized bodies before connecting upstream", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(offer, {Origin: "https://other.invalid"}))).status).toBe(403);
    expect((await POST(request("{}", {"Content-Type": "application/json"}))).status).toBe(415);
    expect((await POST(request("x".repeat(131073)))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("exchanges SDP server-side and never exposes the API key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(offer, {headers: {"Content-Type": "application/sdp"}}));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sdp).toBe(offer);
    expect(body.session.turn_detection.interrupt_response).toBe(true);
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({body: offer, headers: {Authorization: "Bearer private-test-key"}});
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("sanitizes provider errors and rejects invalid SDP answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-test-key", {status: 401})));
    let response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not SDP")));
    response = await POST(request()); expect(response.status).toBe(503);
  });
});
