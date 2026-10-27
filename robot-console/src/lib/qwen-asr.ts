import {qwenApiKey, qwenChatEndpoint} from "./qwen-config";

export const MAX_SPEECH_BYTES = 960044; // 30 seconds, 16 kHz mono PCM16.
export class SpeechRecognitionError extends Error {
  constructor(public code: "no-speech" | "network" = "network") {
    super(code === "no-speech" ? "没有听清，请再说一次。" : "语音转文字暂时不可用，请稍后重试。");
  }
}
/** The browser emits one canonical WAV container; reject disguised files before billing the provider. */
export function validateSpeechWav(bytes: Uint8Array): boolean {
  if (bytes.length < 3244 || bytes.length > MAX_SPEECH_BYTES || bytes.length % 2) return false;
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return b.toString("ascii",0,4)==="RIFF" && b.readUInt32LE(4)===b.length-8
    && b.toString("ascii",8,16)==="WAVEfmt " && b.readUInt32LE(16)===16
    && b.readUInt16LE(20)===1 && b.readUInt16LE(22)===1
    && b.readUInt32LE(24)===16000 && b.readUInt32LE(28)===32000
    && b.readUInt16LE(32)===2 && b.readUInt16LE(34)===16
    && b.toString("ascii",36,40)==="data" && b.readUInt32LE(40)===b.length-44;
}
export async function recognizeQwenSpeech(bytes: Uint8Array, options: {signal?:AbortSignal;fetchImpl?:typeof fetch}={}): Promise<string> {
  const key=qwenApiKey();
  if (!key || !validateSpeechWav(bytes)) throw new SpeechRecognitionError();
  const signal=options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  try {
    signal.throwIfAborted();
    const response=await (options.fetchImpl || fetch)(qwenChatEndpoint(),{
      method:"POST",signal,cache:"no-store",redirect:"error",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
      body:JSON.stringify({
        model:process.env.QWEN_ASR_MODEL?.trim() || "qwen3-asr-flash",
        messages:[{role:"user",content:[{type:"input_audio",input_audio:{data:"data:audio/wav;base64,"+Buffer.from(bytes).toString("base64")}}]}],
        stream:false,asr_options:{language:"zh",enable_itn:true},
      }),
    });
    if (!response.ok) {await response.body?.cancel();throw new SpeechRecognitionError();}
    const payload=await response.json();
    const content=payload.choices?.[0]?.message?.content;
    if (typeof content!=="string" || !content.trim()) throw new SpeechRecognitionError("no-speech");
    return content.trim().slice(0,4000);
  } catch (error) {
    if (error instanceof SpeechRecognitionError) throw error;
    throw new SpeechRecognitionError();
  }
}
