import {afterEach, describe, expect, it, vi} from "vitest";
import {realtimeVideoConfig, realtimeVideoSession} from "./realtime-video-config";

afterEach(() => vi.unstubAllEnvs());
const configure = () => {
  vi.stubEnv("QWEN_REALTIME_API_KEY", "test-realtime-secret");
  vi.stubEnv("QWEN_REALTIME_WORKSPACE_ID", "workspace-123");
};
describe("realtime video configuration", () => {
  it("does not reuse the existing third party text/TTS credential", () => {
    vi.stubEnv("QWEN_REALTIME_API_KEY", ""); vi.stubEnv("DASHSCOPE_API_KEY", "");
    vi.stubEnv("QWEN_TTS_API_KEY", "existing-key");
    expect(realtimeVideoConfig()).toBeNull();
  });
  it("requires a workspace and limits the provider hostname to official regions", () => {
    configure();
    vi.stubEnv("QWEN_REALTIME_REGION", "cn-beijing");
    expect(realtimeVideoConfig()?.endpoint).toBe("https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=qwen3.8-omni-flash-realtime");
    vi.stubEnv("QWEN_REALTIME_WORKSPACE_ID", "bad/path?secret");
    expect(realtimeVideoConfig()).toBeNull();
    configure(); vi.stubEnv("QWEN_REALTIME_REGION", "attacker.invalid");
    expect(realtimeVideoConfig()).toBeNull();
  });
  it("configures input subtitles, automatic interruption and a single read-only tool without credentials", () => {
    configure(); vi.stubEnv("QWEN_REALTIME_REGION", "cn-beijing");
    const session = realtimeVideoSession(realtimeVideoConfig()!);
    expect(session.input_audio_transcription).toEqual({model: "qwen3-asr-flash-realtime"});
    expect(session.turn_detection).toMatchObject({interrupt_response: true, create_response: true});
    expect(session.tools).toHaveLength(1);
    expect(JSON.stringify(session)).not.toContain("test-realtime-secret");
    expect(session.instructions).toContain("看不清");
  });
});
