/** Recognition-compatible microphone transport for WebViews without a working Web Speech service. */
export type SpeechRecognitionEventLike = Event & {
  resultIndex:number;
  results:{length:number;[index:number]:{isFinal:boolean;length:number;[index:number]:{transcript:string;confidence:number}}};
};
export type SpeechRecognitionErrorEventLike = Event & {error:string};
export type SpeechRecognitionLike = {
  continuous:boolean;interimResults:boolean;lang:string;maxAlternatives:number;
  transport?:"recording";
  onlevel?:((level:number)=>void)|null;
  onstart:(()=>void)|null;
  onresult:((event:SpeechRecognitionEventLike)=>void)|null;
  onerror:((event:SpeechRecognitionErrorEventLike)=>void)|null;
  onend:(()=>void)|null;
  start:()=>void;stop:()=>void;abort:()=>void;
};
export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type Mode="hold"|"call";
type Capture={
  controller:AbortController;context:AudioContext;stream?:MediaStream;source?:MediaStreamAudioSourceNode;
  processor?:ScriptProcessorNode;gain?:GainNode;frames:Float32Array[];
  cancelled:boolean;stopping:boolean;recording:boolean;spokenFrames:number;started:number;lastSpeech:number;
  timer?:ReturnType<typeof setTimeout>;
};

/** Downsample PCM to a deterministic, uncompressed format supported by the provider, including on iOS. */
export function encodeSpeechWav(frames:Float32Array[],sampleRate:number):ArrayBuffer {
  const length=frames.reduce((sum,frame)=>sum+frame.length,0);
  const input=new Float32Array(length);let offset=0;
  for(const frame of frames){input.set(frame,offset);offset+=frame.length;}
  const count=Math.min(480000,Math.floor(length*16000/sampleRate));
  const bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
  const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,"RIFF");view.setUint32(4,bytes.byteLength-8,true);text(8,"WAVEfmt ");view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){
    const start=Math.floor(i*sampleRate/16000),end=Math.min(length,Math.max(start+1,Math.floor((i+1)*sampleRate/16000)));
    let sum=0;for(let n=start;n<end;n++)sum+=input[n];
    const value=Math.max(-1,Math.min(1,sum/(end-start)));
    view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return bytes;
}
export class RecordedSpeechRecognition implements SpeechRecognitionLike {
  readonly transport="recording" as const;
  continuous=true;interimResults=false;lang="zh-CN";maxAlternatives=1;
  onstart:(()=>void)|null=null;
  onresult:((event:SpeechRecognitionEventLike)=>void)|null=null;
  onerror:((event:SpeechRecognitionErrorEventLike)=>void)|null=null;
  onend:(()=>void)|null=null;
  onlevel:((level:number)=>void)|null=null;
  private capture?:Capture;
  constructor(private readonly mode:Mode="hold") {}
  get recording(){return Boolean(this.capture?.recording);}
  start(){
    if(this.capture)throw new DOMException("Recording already active","InvalidStateError");
    const Context=window.AudioContext || (window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Context || !navigator.mediaDevices?.getUserMedia){this.onerror?.(Object.assign(new Event("error"),{error:"audio-capture"}));this.onend?.();return;}
    // Create/resume in the button gesture, before waiting for the permission prompt on iOS.
    const context=new Context();
    void context.resume().catch(()=>{});
    const capture:Capture={controller:new AbortController(),context,frames:[],cancelled:false,stopping:false,recording:false,spokenFrames:0,started:Date.now(),lastSpeech:0};
    this.capture=capture;
    capture.timer=setTimeout(()=>this.fail(capture,"not-allowed"),15000);
    void this.open(capture);
  }
  private async open(capture:Capture){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(this.capture!==capture || capture.cancelled){stream.getTracks().forEach(track=>track.stop());return;}
      capture.stream=stream;
      if(capture.stopping){this.fail(capture,"no-speech");return;}
      clearTimeout(capture.timer);
      capture.source=capture.context.createMediaStreamSource(stream);
      capture.processor=capture.context.createScriptProcessor(4096,1,1);
      capture.gain=capture.context.createGain();capture.gain.gain.value=0;
      capture.source.connect(capture.processor);capture.processor.connect(capture.gain);capture.gain.connect(capture.context.destination);
      capture.started=Date.now();capture.recording=true;
      capture.processor.onaudioprocess=event=>{
        if(this.capture!==capture || !capture.recording)return;
        const frame=new Float32Array(event.inputBuffer.getChannelData(0));
        capture.frames.push(frame);
        const rms=Math.sqrt(frame.reduce((sum,value)=>sum+value*value,0)/frame.length);
        this.onlevel?.(Math.min(1,rms*8));
        if(rms>=0.012){capture.spokenFrames++;capture.lastSpeech=Date.now();}
        if(this.mode==="call" && capture.spokenFrames>=3 && Date.now()-capture.lastSpeech>=1100)this.stop();
        else if(capture.frames.reduce((sum,part)=>sum+part.length,0)>=capture.context.sampleRate*25)this.stop();
      };
      capture.timer=setTimeout(()=>{
        if(this.mode==="call" && capture.spokenFrames<3){this.fail(capture,"no-speech");return;}
        if(this.mode==="call")capture.timer=setTimeout(()=>this.stop(),17000);
        else this.stop();
      },this.mode==="call"?8000:25000);
      this.onstart?.();
    }catch(error){
      const name=error instanceof Error?error.name:"";
      this.fail(capture,name==="NotAllowedError"||name==="SecurityError"?"not-allowed":"audio-capture");
    }
  }
  private release(capture:Capture){
    capture.recording=false;clearTimeout(capture.timer);
    if(capture.processor)capture.processor.onaudioprocess=null;
    capture.source?.disconnect();capture.processor?.disconnect();capture.gain?.disconnect();
    capture.stream?.getTracks().forEach(track=>track.stop());capture.stream=undefined;
    if(capture.context.state!=="closed")void capture.context.close().catch(()=>{});
    this.onlevel?.(0);
  }
  private end(capture:Capture){
    if(this.capture!==capture)return;
    this.capture=undefined;capture.frames=[];
    this.onend?.();
  }
  private fail(capture:Capture,error:string){
    if(this.capture!==capture || capture.cancelled)return;
    capture.cancelled=true;capture.controller.abort();this.release(capture);
    this.onerror?.(Object.assign(new Event("error"),{error}));
    this.end(capture);
  }
  stop(){
    const capture=this.capture;
    if(!capture || capture.stopping)return;
    capture.stopping=true;
    if(!capture.stream)return; // Permission is still pending; open() will release that late stream.
    this.release(capture);
    if(capture.spokenFrames<3){this.fail(capture,"no-speech");return;}
    const bytes=encodeSpeechWav(capture.frames,capture.context.sampleRate);capture.frames=[];
    void this.transcribe(capture,bytes);
  }
  private async transcribe(capture:Capture,bytes:ArrayBuffer){
    // Older WebKit has AbortController but not AbortSignal.any/timeout.
    const timeout=setTimeout(()=>capture.controller.abort(),25000);
    try{
      const response=await fetch("/api/voice/transcribe",{
        method:"POST",body:bytes,headers:{"Content-Type":"audio/wav"},
        signal:capture.controller.signal,
      });
      const payload=await response.json();
      if(this.capture!==capture || capture.cancelled)return;
      if(!response.ok || typeof payload.text!=="string" || !payload.text.trim()){
        this.fail(capture,payload.code==="no-speech"?"no-speech":"network");return;
      }
      this.onresult?.(Object.assign(new Event("result"),{resultIndex:0,results:{length:1,0:{isFinal:true,length:1,0:{transcript:payload.text.trim(),confidence:1}}}}));
      this.end(capture);
    }catch{this.fail(capture,"network");}
    finally{clearTimeout(timeout);}
  }
  abort(){
    const capture=this.capture;if(!capture)return;
    capture.cancelled=true;capture.controller.abort();this.release(capture);this.end(capture);
  }
}
let nativeServiceBlocked=false;
export function markNativeSpeechUnavailable(){nativeServiceBlocked=true;}
export function compatibleSpeechRecognitionConstructor(mode:Mode="hold"):SpeechRecognitionConstructor|undefined {
  const w=window as typeof window & {SpeechRecognition?:SpeechRecognitionConstructor;webkitSpeechRecognition?:SpeechRecognitionConstructor;webkitAudioContext?:typeof AudioContext};
  const Native=w.SpeechRecognition || w.webkitSpeechRecognition;
  const canRecord=Boolean((w.AudioContext || w.webkitAudioContext) && navigator.mediaDevices?.getUserMedia);
  if(canRecord && (/MicroMessenger/iu.test(navigator.userAgent) || !Native || nativeServiceBlocked)){
    return class extends RecordedSpeechRecognition {constructor(){super(mode);}};
  }
  return nativeServiceBlocked ? undefined : Native;
}
