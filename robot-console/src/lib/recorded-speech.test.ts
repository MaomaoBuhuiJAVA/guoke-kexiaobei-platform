import {afterEach, describe, expect, it, vi} from "vitest";
import {encodeSpeechWav, RecordedSpeechRecognition, compatibleSpeechRecognitionConstructor} from "./recorded-speech";

afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
function recordingEnvironment() {
  let receive: ((event:{inputBuffer:{getChannelData:()=>Float32Array}})=>void) | null = null;
  const stop=vi.fn(), close=vi.fn(async () => {}),disconnect=vi.fn();
  const track=Object.assign(new EventTarget(),{stop,readyState:"live",enabled:true,muted:false});
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const contexts: AudioContextMock[]=[];
  const processor={connect:vi.fn(),disconnect,get onaudioprocess(){return receive;},set onaudioprocess(value){receive=value;}};
  class AudioContextMock {
    constructor(){contexts.push(this);}
    sampleRate=48000; destination={}; state="running";
    resume=vi.fn(async () => {this.state="running";}); close=close;
    createMediaStreamSource(){return {connect:vi.fn(),disconnect};}
    createScriptProcessor(){return processor;}
    createGain(){return {gain:{value:1},connect:vi.fn(),disconnect};}
  }
  vi.stubGlobal("window", {AudioContext:AudioContextMock});
  vi.stubGlobal("navigator",{userAgent:"MicroMessenger",mediaDevices:{getUserMedia:vi.fn(async () => stream)}});
  const push=(amplitude=0.2)=>receive?.({inputBuffer:{getChannelData:()=>new Float32Array(4800).fill(amplitude)}});
  return {stop,close,push,track,stream,contexts};
}
describe("WeChat compatible microphone input", () => {
  it("resumes the audio graph again after a permission prompt suspended it", async () => {
    const env=recordingEnvironment();
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(async()=>{env.contexts[0].state="suspended";return env.stream;})}});
    const recognition=new RecordedSpeechRecognition(); recognition.start();
    await vi.waitFor(()=>expect(env.contexts[0].resume).toHaveBeenCalledTimes(2));
    expect(env.contexts[0].state).toBe("running");
    recognition.abort();
  });
  it("terminates cleanly if the microphone track ends during a held recording", async () => {
    const env=recordingEnvironment(), error=vi.fn(), ended=vi.fn(), fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    const recognition=new RecordedSpeechRecognition(); recognition.onerror=error;recognition.onend=ended;recognition.start();
    await vi.waitFor(()=>expect(recognition.recording).toBe(true));
    env.push(); env.track.readyState="ended";env.track.dispatchEvent(new Event("ended"));
    expect(error.mock.calls[0]?.[0].error).toBe("audio-capture");
    expect(ended).toHaveBeenCalledTimes(1);expect(fetcher).not.toHaveBeenCalled();expect(env.stop).toHaveBeenCalled();
  });
  it("detects capture stalling after listening and allows a fresh attempt", async () => {
    vi.useFakeTimers();
    const env=recordingEnvironment(), error=vi.fn();
    const recognition=new RecordedSpeechRecognition(); recognition.onerror=error;recognition.start();
    await vi.advanceTimersByTimeAsync(1);env.push();
    await vi.advanceTimersByTimeAsync(3001);
    expect(error.mock.calls[0]?.[0].error).toBe("audio-capture");
    recognition.start();await vi.advanceTimersByTimeAsync(1);
    expect(env.contexts).toHaveLength(2);expect(recognition.recording).toBe(true);recognition.abort();
  });
  it("supports two consecutive recordings without stale frames or results", async () => {
    const env=recordingEnvironment(), result=vi.fn();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({text:"连续录音"})));
    const recognition=new RecordedSpeechRecognition();recognition.onresult=result;
    for(let round=1;round<=2;round++){
      recognition.start();await vi.waitFor(()=>expect(recognition.recording).toBe(true));
      env.push();env.push();env.push();recognition.stop();
      await vi.waitFor(()=>expect(result).toHaveBeenCalledTimes(round));
    }
    expect(env.contexts).toHaveLength(2);
  });
  it("selects a single recording stream on iPhone Edge instead of native recognition plus a second meter", () => {
    recordingEnvironment();
    class Native {}
    (window as unknown as {SpeechRecognition: typeof Native}).SpeechRecognition = Native;
    vi.stubGlobal("navigator", {userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 EdgiOS/140.0", mediaDevices: {getUserMedia: vi.fn()}});
    expect(compatibleSpeechRecognitionConstructor("hold")?.prototype).toBeInstanceOf(RecordedSpeechRecognition);
  });
  it("does not announce listening before the first actual microphone frame", async () => {
    const env = recordingEnvironment();
    const recognition = new RecordedSpeechRecognition();
    const started = vi.fn(); recognition.onstart = started;
    recognition.start();
    await vi.waitFor(() => expect(recognition.recording).toBe(true));
    expect(started).not.toHaveBeenCalled();
    env.push();
    expect(started).toHaveBeenCalledTimes(1);
    recognition.abort();
  });
  it("fails and frees the microphone when an allowed stream delivers no frames", async () => {
    vi.useFakeTimers();
    const env = recordingEnvironment(), error = vi.fn(), ended = vi.fn();
    const recognition = new RecordedSpeechRecognition();
    recognition.onerror = error; recognition.onend = ended; recognition.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(error.mock.calls[0]?.[0].error).toBe("audio-capture");
    expect(ended).toHaveBeenCalledTimes(1);
    expect(env.stop).toHaveBeenCalled();
  });
  it("accepts quiet but audible speech instead of discarding it as silence", async () => {
    const env=recordingEnvironment(), fetcher=vi.fn(async () => Response.json({text: "小声提问也能识别"}));
    vi.stubGlobal("fetch", fetcher);
    const recognition=new RecordedSpeechRecognition(), result=vi.fn(); recognition.onresult=result; recognition.start();
    await vi.waitFor(() => expect(recognition.recording).toBe(true));
    env.push(0.007); env.push(0.007); env.push(0.007); recognition.stop();
    await vi.waitFor(() => expect(result).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("selects recording for WeChat even when a blocked native recognition constructor exists", () => {
    recordingEnvironment();
    class Native {}
    const w=window as unknown as {SpeechRecognition:typeof Native};
    w.SpeechRecognition=Native;
    expect(compatibleSpeechRecognitionConstructor("hold")?.prototype).toBeInstanceOf(RecordedSpeechRecognition);
    vi.stubGlobal("navigator",{userAgent:"Chrome",mediaDevices:{getUserMedia:vi.fn()}});
    expect(compatibleSpeechRecognitionConstructor("hold")).toBe(Native);
  });
  it("encodes 48 kHz samples as bounded 16 kHz PCM without modifying source samples", () => {
    const source=new Float32Array(4800).fill(0.25);
    const bytes=new Uint8Array(encodeSpeechWav([source],48000));
    const view=new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0,4))).toBe("RIFF");
    expect(view.getUint32(24,true)).toBe(16000);
    expect(bytes.length).toBe(3244);
    expect(view.getInt16(44,true)).toBe(8192);
    expect(source[0]).toBe(0.25);
  });
  it("uploads only after release, produces a final result, and releases microphone resources", async () => {
    const env=recordingEnvironment();
    const fetcher=vi.fn<typeof fetch>(async () => Response.json({text:"磁铁为什么能吸铁？"}));
    vi.stubGlobal("fetch",fetcher);
    const recognition=new RecordedSpeechRecognition("hold");
    const result=vi.fn(), ended=vi.fn();
    recognition.onresult=result; recognition.onend=ended;
    recognition.start();
    await vi.waitFor(() => expect(recognition.recording).toBe(true));
    env.push();env.push();env.push();
    expect(fetcher).not.toHaveBeenCalled();
    recognition.stop();
    await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
    expect(result.mock.calls[0][0].results[0][0].transcript).toBe("磁铁为什么能吸铁？");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/voice/transcribe");
    expect(env.stop).toHaveBeenCalled();
    expect(env.close).toHaveBeenCalled();
  });
  it("does not upload on cancellation and discards late microphone permission results", async () => {
    const env=recordingEnvironment(), fetcher=vi.fn();
    let resolve!: (stream:MediaStream)=>void;
    vi.stubGlobal("fetch",fetcher);
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(r=>{resolve=r;})}});
    const recognition=new RecordedSpeechRecognition("hold"),result=vi.fn();
    recognition.onresult=result; recognition.start(); recognition.abort();
    resolve({getTracks:()=>[{stop:env.stop}]} as unknown as MediaStream);
    await new Promise(r=>setTimeout(r,0));
    expect(env.stop).toHaveBeenCalled();expect(result).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  });
  it("stops recording after a spoken turn followed by silence in phone mode", async () => {
    vi.useFakeTimers();
    const env=recordingEnvironment(), fetcher=vi.fn(async()=>Response.json({text:"为什么下雨？"}));
    vi.stubGlobal("fetch",fetcher);
    const recognition=new RecordedSpeechRecognition("call");
    const result=vi.fn();recognition.onresult=result;recognition.start();
    await vi.advanceTimersByTimeAsync(1);
    for(let i=0;i<4;i++){env.push();await vi.advanceTimersByTimeAsync(100);}
    for(let i=0;i<13;i++){env.push(0);await vi.advanceTimersByTimeAsync(100);}
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);
    expect(env.stop).toHaveBeenCalled();
    recognition.abort();
  });
  it("discards transcription after hangup and aborts its upload", async () => {
    const env=recordingEnvironment();
    let resolve!: (response:Response)=>void;
    let signal:AbortSignal|undefined;
    vi.stubGlobal("fetch",vi.fn((_url,init)=>{signal=init.signal;return new Promise<Response>(r=>{resolve=r;});}));
    const recognition=new RecordedSpeechRecognition("hold"),result=vi.fn();
    recognition.onresult=result;recognition.start();
    await vi.waitFor(()=>expect(recognition.recording).toBe(true));
    env.push();env.push();env.push();recognition.stop();recognition.abort();
    resolve(Response.json({text:"不应该发送的旧录音"}));
    await new Promise(r=>setTimeout(r,0));
    expect(signal?.aborted).toBe(true);expect(result).not.toHaveBeenCalled();
  });
  it("does not bill the provider for silence or an unapproved microphone", async () => {
    const env=recordingEnvironment(),fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    const recognition=new RecordedSpeechRecognition("hold"),error=vi.fn();
    recognition.onerror=error;recognition.start();
    await vi.waitFor(()=>expect(recognition.recording).toBe(true));
    env.push(0);env.push(0);env.push(0);recognition.stop();
    expect(error.mock.calls[0][0].error).toBe("no-speech");
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:()=>Promise.reject(new DOMException("Denied","NotAllowedError"))}});
    recognition.start();
    await vi.waitFor(()=>expect(error).toHaveBeenCalledTimes(2));
    expect(error.mock.calls[1][0].error).toBe("not-allowed");expect(fetcher).not.toHaveBeenCalled();
  });
});
