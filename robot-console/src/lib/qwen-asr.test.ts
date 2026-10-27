import {afterEach, describe, expect, it, vi} from "vitest";
import {recognizeQwenSpeech, validateSpeechWav, MAX_SPEECH_BYTES} from "./qwen-asr";

function wav() {
  const b = Buffer.alloc(44 + 3200);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8,4); b.write("WAVEfmt ",8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34);
  b.write("data",36); b.writeUInt32LE(3200,40);
  return b;
}
afterEach(() => vi.unstubAllEnvs());
describe("recorded speech recognition", () => {
  it("accepts bounded mono PCM and rejects disguised or oversized recordings", () => {
    expect(validateSpeechWav(wav())).toBe(true);
    expect(validateSpeechWav(Buffer.from("<html>not audio</html>"))).toBe(false);
    expect(validateSpeechWav(Buffer.alloc(MAX_SPEECH_BYTES + 1))).toBe(false);
    const wrong = wav(); wrong.writeUInt32LE(48000,24);
    expect(validateSpeechWav(wrong)).toBe(false);
    const truncated = wav().subarray(0,60);
    expect(validateSpeechWav(truncated)).toBe(false);
  });
  it("sends inline audio to the configured provider and returns only the transcript", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-asr-key");
    let sent: Record<string, unknown> | undefined;
    const text = await recognizeQwenSpeech(wav(), {fetchImpl: async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({choices:[{message:{content:"磁铁能吸铁钉。"}}]});
    }});
    expect(text).toBe("磁铁能吸铁钉。");
    expect(sent).toMatchObject({model:"qwen3-asr-flash",stream:false,asr_options:{language:"zh"}});
    expect(JSON.stringify(sent)).toContain("data:audio/wav;base64,");
    expect(JSON.stringify(sent)).not.toContain("test-asr-key");
  });
  it("rejects empty speech, upstream errors, and already cancelled requests", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-asr-key");
    await expect(recognizeQwenSpeech(wav(), {fetchImpl:async () => Response.json({choices:[{message:{content:""}}]})})).rejects.toMatchObject({code:"no-speech"});
    await expect(recognizeQwenSpeech(wav(), {fetchImpl:async () => new Response("private upstream details",{status:401})})).rejects.toThrow("语音转文字暂时不可用");
    const fetcher=vi.fn();
    await expect(recognizeQwenSpeech(wav(), {signal:AbortSignal.abort(),fetchImpl:fetcher})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
