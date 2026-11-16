export type VideoCallPhase = "idle" | "preparing" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";
export type VideoResourceLink = {id: string; title: string; href: string};
export type VideoCallState = {
  phase: VideoCallPhase; notice: string; user: string; assistant: string;
  microphone: boolean; camera: boolean; speaker: boolean; facing: "user" | "environment"; cameraBusy: boolean;
};
export const initialVideoCallState: VideoCallState = {phase: "idle", notice: "让科小贝看一看，一起聊科学", user: "", assistant: "", microphone: true, camera: true, speaker: true, facing: "environment", cameraBusy: false};
type RealtimeEvent = {type: string; event_id?: string; response_id?: string; item_id?: string; delta?: string; transcript?: string; text?: string; stash?: string; response?: {id?: string; status?: string}; name?: string; call_id?: string; arguments?: string};
type Options = {
  audio: HTMLAudioElement; onState: (state: VideoCallState) => void; onPreview: (stream: MediaStream | null) => void;
  onTurn?: (turn: {role: "user" | "assistant"; text: string}) => void; onResources?: (links: VideoResourceLink[]) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeer?: () => RTCPeerConnection; fetchImpl?: typeof fetch;
};
const stopStream = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());

/** Owns one call. Every asynchronous operation is scoped to its generation. */
export class RealtimeVideoCall {
  private state: VideoCallState = {...initialVideoCallState};
  private generation = 0;
  private active = false;
  private peer: RTCPeerConnection | null = null;
  private channels: RTCDataChannel[] = [];
  private tracks = new Set<MediaStreamTrack>();
  private video: MediaStreamTrack | null = null;
  private videoSender: RTCRtpSender | null = null;
  private controller: AbortController | null = null;
  private session: Record<string, unknown> | null = null;
  private configured = false;
  private acknowledged = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private turns = new Set<string>();
  private cancelled = new Set<string>();
  private responseId = "";
  private suppressAudio = false;
  private toolEpoch = 0;
  private tools = new Map<string, RealtimeEvent>();
  private handledTools = new Set<string>();
  private runningToolEpoch: number | null = null;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: Options) {this.fetcher = options.fetchImpl || globalThis.fetch.bind(globalThis);}

  private update(change: Partial<VideoCallState>) {this.state = {...this.state, ...change}; this.options.onState(this.state);}
  private current(id: number) {return this.active && this.generation === id;}
  private capture(constraints: MediaStreamConstraints) {return (this.options.getUserMedia || (c => navigator.mediaDevices.getUserMedia(c)))(constraints);}
  private send(event: Record<string, unknown>) {
    const channel = this.channels.find(c => c.label === "txt" && c.readyState === "open") || this.channels.find(c => c.readyState === "open");
    if (!channel) return false;
    try {channel.send(JSON.stringify(event)); return true;} catch {return false;}
  }
  private configure() {
    if (!this.active || this.configured || !this.session) return;
    if (this.send({type: "session.update", session: this.session})) this.configured = true;
  }
  private bindChannel(channel: RTCDataChannel, id: number) {
    this.channels.push(channel);
    channel.onopen = () => {if (this.current(id)) this.configure();};
    channel.onmessage = event => {
      if (!this.current(id) || typeof event.data !== "string" || event.data.length > 262144) return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (parsed && typeof parsed === "object" && "type" in parsed && typeof parsed.type === "string") this.receive(parsed as RealtimeEvent, id);
      } catch { /* Ignore malformed control frames; the connection watchdog remains active. */ }
    };
    this.configure();
  }
  async start() {
    if (this.active) return;
    this.active = true; const id = ++this.generation;
    this.controller = new AbortController();
    this.update({...initialVideoCallState, phase: "preparing", notice: "正在连接摄像头和麦克风…"});
    this.timeout = setTimeout(() => {if (this.current(id)) this.fail("连接超时，请检查权限和网络后重试。");}, 45_000);
    try {
      const stream = await this.capture({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: {facingMode: {ideal: this.state.facing}, width: {ideal: 960}, height: {ideal: 540}, frameRate: {ideal: 10, max: 15}}});
      if (!this.current(id)) {stopStream(stream); return;}
      if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) {stopStream(stream); throw new Error("missing-media");}
      stream.getTracks().forEach(track => {
        this.tracks.add(track); track.enabled = false;
        track.addEventListener("ended", () => {if (this.current(id) && this.tracks.has(track)) this.fail("摄像头或麦克风已断开，请重新连接。");});
      });
      this.video = stream.getVideoTracks()[0]; this.options.onPreview(stream);
      const peer = (this.options.createPeer || (() => new RTCPeerConnection()))(); this.peer = peer;
      stream.getTracks().forEach(track => {const sender = peer.addTrack(track, stream); if (track.kind === "video") this.videoSender = sender;});
      peer.onconnectionstatechange = () => {
        if (!this.current(id)) return;
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) this.fail("视频连接已断开，请检查网络后重新拨打。");
      };
      peer.ondatachannel = event => {if (this.current(id)) this.bindChannel(event.channel, id); else event.channel.close();};
      peer.ontrack = event => {
        if (!this.current(id) || event.track.kind !== "audio") return;
        this.options.audio.srcObject = new MediaStream([event.track]);
        this.options.audio.muted = !this.state.speaker || this.suppressAudio;
        void this.options.audio.play().catch(() => {if (this.current(id)) this.update({speaker: false, notice: "点一下扬声器，即可听见科小贝。"});});
      };
      this.bindChannel(peer.createDataChannel("oai-events"), id);
      this.update({phase: "connecting", notice: "正在接通科小贝…"});
      const offer = await peer.createOffer();
      if (!this.current(id)) return;
      await peer.setLocalDescription(offer);
      if (!this.current(id)) return;
      await this.waitForIce(peer, this.controller.signal);
      if (!this.current(id)) return;
      const response = await this.fetcher("/api/video-call/session", {method: "POST", headers: {"Content-Type": "application/sdp"}, body: peer.localDescription?.sdp, signal: this.controller.signal});
      if (!response.ok) throw new Error("service");
      const result = await response.json();
      if (!this.current(id)) return;
      if (typeof result.sdp !== "string" || !result.session || typeof result.session !== "object") throw new Error("service");
      this.session = result.session;
      await peer.setRemoteDescription({type: "answer", sdp: result.sdp});
      if (this.current(id)) this.configure();
    } catch (error) {
      if (!this.current(id)) return;
      const name = error instanceof Error ? error.name : "";
      this.fail(name === "NotAllowedError" || name === "SecurityError" ? "需要允许摄像头和麦克风，才能视频通话。"
        : name === "NotFoundError" ? "没有找到摄像头或麦克风，请连接设备后重试。"
        : name === "NotReadableError" ? "设备可能被其他应用占用，请关闭占用后重试。" : "暂时没能接通科小贝，请检查服务和网络后重试。");
    }
  }
  private async waitForIce(peer: RTCPeerConnection, signal: AbortSignal) {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); signal.removeEventListener("abort", aborted); resolve();};
      const changed = () => {if (peer.iceGatheringState === "complete") finish();};
      const aborted = () => {finish(); reject(new DOMException("Aborted", "AbortError"));};
      const timer = setTimeout(finish, 2500);
      peer.addEventListener("icegatheringstatechange", changed); signal.addEventListener("abort", aborted, {once: true});
      if (signal.aborted) aborted();
    });
  }
  private emitTurn(role: "user" | "assistant", key: string, text: string) {
    if (!text.trim() || this.turns.has(key)) return;
    this.turns.add(key); this.options.onTurn?.({role, text: text.trim().slice(0, 8000)});
  }
  private receive(event: RealtimeEvent, id: number) {
    if (event.event_id) {
      if (this.seen.has(event.event_id)) return;
      this.seen.add(event.event_id); if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!);
    }
    this.configure();
    if (event.response_id && this.cancelled.has(event.response_id)) return;
    switch (event.type) {
      case "session.updated":
        if (this.acknowledged) break;
        this.acknowledged = true; if (this.timeout) clearTimeout(this.timeout);
        this.tracks.forEach(t => {t.enabled = t.kind === "audio" ? this.state.microphone : this.state.camera;});
        this.update({phase: "listening", notice: "已接通，把想探索的东西放到镜头前吧。"});
        this.durationTimer = setTimeout(() => {if (this.current(id)) {this.stop(); this.update({notice: "本次通话已结束，想继续可以再次拨打。"});}}, 10 * 60_000);
        break;
      case "error": this.fail("通话服务遇到问题，请稍后重新拨打。"); break;
      case "input_audio_buffer.speech_started":
        this.cancelCurrentResponse(false); this.update({phase: "listening", user: "", assistant: "", notice: "你说，我在听。"}); break;
      case "input_audio_buffer.speech_stopped": this.update({phase: "thinking", notice: "科小贝正在看、正在想…"}); break;
      case "conversation.item.input_audio_transcription.delta":
        this.update({user: ((event.text || "") + (event.stash || "")).slice(0, 8000)}); break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof event.transcript === "string") {this.update({user: event.transcript.slice(0, 8000)}); this.emitTurn("user", `u:${event.item_id || event.transcript}`, event.transcript);} break;
      case "response.created":
        this.responseId = event.response?.id || ""; this.suppressAudio = false;
        this.options.audio.muted = !this.state.speaker;
        this.update({assistant: "", phase: "thinking", notice: "科小贝正在想…"}); break;
      case "response.audio_transcript.delta": case "response.text.delta":
        if (this.suppressAudio) break;
        this.update({assistant: (this.state.assistant + (event.delta || "")).slice(0, 8000), phase: "speaking", notice: "科小贝正在回答，随时可以插话。"}); break;
      case "response.audio_transcript.done": case "response.text.done":
        if (!this.suppressAudio) this.emitTurn("assistant", `a:${event.response_id || this.responseId}`, event.transcript || event.text || this.state.assistant); break;
      case "response.function_call_arguments.done":
        if (event.call_id && !this.handledTools.has(event.call_id) && this.tools.size < 5) this.tools.set(event.call_id, event); break;
      case "response.done":
        if (event.response?.id && this.cancelled.has(event.response.id)) break;
        if (this.tools.size) void this.executeTools(id);
        else this.update({phase: "listening", notice: "我在这里，继续聊吧。"});
        this.responseId = ""; break;
    }
  }
  private cancelCurrentResponse(explicit: boolean) {
    const responseId = this.responseId;
    if (responseId) {this.cancelled.add(responseId); if (explicit) this.send({type: "response.cancel"});}
    this.suppressAudio = true; this.options.audio.muted = true; this.responseId = "";
    this.tools.clear(); this.toolEpoch++;
  }
  interrupt() {
    if (!this.active || !this.acknowledged) return;
    this.cancelCurrentResponse(true); this.update({phase: "listening", assistant: "", notice: "好，你说，我在听。"});
  }
  private async executeTools(id: number) {
    const epoch = this.toolEpoch;
    if (this.runningToolEpoch === epoch) return;
    this.runningToolEpoch = epoch;
    const pending = [...this.tools.values()]; this.tools.clear();
    this.update({phase: "thinking", notice: "正在找园本资料…"});
    try {
      for (const tool of pending) {
        if (!this.current(id) || epoch !== this.toolEpoch) return;
        this.handledTools.add(tool.call_id!);
        let evidence = "未能查询到资料，请说明查询暂时不可用。";
        try {
          const args = JSON.parse(tool.arguments || "{}");
          if (tool.name === "search_science_resources" && typeof args.query === "string") {
            const response = await this.fetcher("/api/video-call/resources", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: tool.name, query: args.query}), signal: this.controller!.signal});
            if (response.ok) {
              const result = await response.json();
              evidence = String(result.evidence).slice(0, 12000);
              if (this.current(id) && epoch === this.toolEpoch && Array.isArray(result.labLinks)) this.options.onResources?.(result.labLinks);
            }
          }
        } catch { /* The model receives an explicit tool failure rather than invented evidence. */ }
        if (!this.current(id) || epoch !== this.toolEpoch) return;
        this.send({type: "conversation.item.create", item: {type: "function_call_output", call_id: tool.call_id, output: evidence}});
      }
      if (this.current(id) && epoch === this.toolEpoch) this.send({type: "response.create"});
    } finally {if (this.runningToolEpoch === epoch) this.runningToolEpoch = null;}
  }
  toggleMicrophone() {
    if (!this.active || !this.acknowledged) return;
    const microphone = !this.state.microphone;
    this.tracks.forEach(track => {if (track.kind === "audio") track.enabled = microphone;});
    this.update({microphone, notice: microphone ? "麦克风已开启。" : "麦克风已静音。"});
  }
  async toggleSpeaker() {
    if (!this.active) return;
    const speaker = !this.state.speaker; this.options.audio.muted = !speaker || this.suppressAudio;
    this.update({speaker});
    if (speaker) try {await this.options.audio.play();} catch {if (this.active) this.update({speaker: false, notice: "声音未能播放，请再点一下扬声器。"});}
  }
  async toggleCamera() {
    if (!this.active || !this.acknowledged || this.state.cameraBusy) return;
    if (this.video) {
      const id = this.generation;
      this.update({cameraBusy: true});
      const old = this.video; this.tracks.delete(old); old.stop(); this.video = null;
      try {await this.videoSender?.replaceTrack(null);} catch {if (this.current(id)) this.fail("摄像头连接出现问题，请重新拨打。"); return;}
      if (!this.current(id)) return;
      this.options.onPreview(null);
      this.update({camera: false, cameraBusy: false, notice: "摄像头已关闭，可以继续语音聊天。"});
      this.send({type: "conversation.item.create", item: {type: "message", role: "user", content: [{type: "input_text", text: "我已关闭摄像头。之后不要把旧画面当作当前所见，直到重新开启。"}]}});
    } else await this.replaceCamera(this.state.facing);
  }
  async switchCamera() {
    if (!this.active || !this.acknowledged || this.state.cameraBusy) return;
    await this.replaceCamera(this.state.facing === "user" ? "environment" : "user");
  }
  private async replaceCamera(facing: "user" | "environment") {
    const id = this.generation;
    this.update({cameraBusy: true});
    const old = this.video; if (old) {this.tracks.delete(old); old.stop(); this.video = null;}
    this.options.onPreview(null);
    try {
      await this.videoSender?.replaceTrack(null);
      if (!this.current(id)) return;
      const stream = await this.capture({audio: false, video: {facingMode: {ideal: facing}, width: {ideal: 960}, height: {ideal: 540}, frameRate: {ideal: 10, max: 15}}});
      if (!this.current(id)) {stopStream(stream); return;}
      const video = stream.getVideoTracks()[0];
      // An audio track is never expected from this camera-only request.
      stream.getAudioTracks().forEach(track => track.stop());
      if (!video) {stopStream(stream); throw new Error("missing-camera");}
      this.video = video; this.tracks.add(video);
      video.addEventListener("ended", () => {if (this.current(id) && this.tracks.has(video)) this.fail("摄像头已断开，请重新拨打。");});
      await this.videoSender?.replaceTrack(video);
      if (!this.current(id)) return;
      this.options.onPreview(stream); this.update({camera: true, facing, notice: "摄像头已开启，科小贝可以看见新画面了。"});
    } catch {
      if (this.current(id)) {if (this.video) {this.tracks.delete(this.video); this.video.stop(); this.video = null;} this.update({camera: false, notice: "未能开启这个摄像头，可重新开启或继续语音聊天。"});}
    } finally {if (this.current(id)) this.update({cameraBusy: false});}
  }
  private fail(notice: string) {this.cleanup(); this.update({phase: "error", notice, camera: false, microphone: false, cameraBusy: false});}
  stop() {this.cleanup(); this.update({phase: "ended", notice: "通话已结束", camera: false, microphone: false, cameraBusy: false});}
  private cleanup() {
    this.active = false; this.generation++; this.controller?.abort(); this.controller = null;
    if (this.timeout) clearTimeout(this.timeout); if (this.durationTimer) clearTimeout(this.durationTimer);
    this.timeout = null; this.durationTimer = null;
    for (const channel of this.channels) {channel.onmessage = null; channel.onopen = null; channel.close();}
    this.channels = []; if (this.peer) {this.peer.onconnectionstatechange = null; this.peer.ondatachannel = null; this.peer.ontrack = null; this.peer.close();} this.peer = null;
    this.tracks.forEach(track => track.stop()); this.tracks.clear(); this.video = null; this.videoSender = null;
    this.options.audio.pause(); this.options.audio.srcObject = null; this.options.onPreview(null);
    this.session = null; this.configured = false; this.acknowledged = false; this.responseId = ""; this.suppressAudio = false;
    this.tools.clear(); this.toolEpoch++; this.seen.clear(); this.cancelled.clear(); this.turns.clear(); this.handledTools.clear();
  }
}
