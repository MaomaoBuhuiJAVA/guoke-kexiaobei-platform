import {afterEach, describe, expect, it, vi} from "vitest";
import {RealtimeVideoCall, type VideoCallState} from "./realtime-video-call";

function track(kind: "audio" | "video") {return {kind, enabled: true, readyState: "live", stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn()};}
function stream() {
  const tracks = [track("audio"), track("video")];
  return {tracks, getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === "audio"), getVideoTracks: () => tracks.filter(t => t.kind === "video")};
}
class Channel {
  readyState = "open"; label = "oai-events"; sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null; onmessage: ((e: {data: string}) => void) | null = null;
  send(s: string) {this.sent.push(JSON.parse(s));} close = vi.fn();
  event(e: Record<string, unknown>) {this.onmessage?.({data: JSON.stringify(e)});}
}
class Peer {
  connectionState = "new"; iceGatheringState = "complete"; localDescription = {sdp: "v=0"};
  channel = new Channel(); senders: Array<{track: ReturnType<typeof track> | null; replaceTrack: ReturnType<typeof vi.fn>}> = [];
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: {channel: Channel}) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  addTrack(t: ReturnType<typeof track>) {const sender = {track: t, replaceTrack: vi.fn(async (next) => {sender.track = next;})}; this.senders.push(sender); return sender;}
  getSenders() {return this.senders;}
  createDataChannel() {return this.channel;}
  createOffer = vi.fn(async () => ({type: "offer", sdp: "v=0"}));
  setLocalDescription = vi.fn(async () => {}); setRemoteDescription = vi.fn(async () => {});
  close = vi.fn(); addEventListener = vi.fn(); removeEventListener = vi.fn();
}
function setup(capture = stream()) {
  const peer = new Peer(), audio = {srcObject: null, muted: false, play: vi.fn(async () => {}), pause: vi.fn()};
  const states: VideoCallState[] = [], turns: Array<{role: string; text: string}> = [];
  const getUserMedia = vi.fn(async () => capture as unknown as MediaStream);
  const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith("session")
    ? {sdp: "v=0", session: {instructions: "科小贝"}} : {evidence: "资料", labLinks: []}), {headers: {"Content-Type": "application/json"}}));
  const call = new RealtimeVideoCall({audio: audio as unknown as HTMLAudioElement, onState: s => states.push({...s}), onPreview: vi.fn(), onTurn: t => turns.push(t),
    getUserMedia, createPeer: () => peer as unknown as RTCPeerConnection, fetchImpl: fetcher as typeof fetch});
  return {call, capture, peer, audio, states, turns, getUserMedia, fetcher};
}
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
describe("realtime video lifecycle", () => {
  it("holds RTP until configured and starts audio before sending video", async () => {
    vi.useFakeTimers();
    const s = setup(); await s.call.start();
    expect(s.peer.senders.map(sender => sender.track)).toEqual([null, null]);
    s.peer.channel.event({type: "session.updated"});
    await vi.advanceTimersByTimeAsync(0);
    expect(s.peer.senders[0].track).toBe(s.capture.getAudioTracks()[0]);
    expect(s.peer.senders[1].track).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(s.peer.senders[1].track).toBe(s.capture.getVideoTracks()[0]);
    s.call.stop();
  });
  it("preserves the browser receiver when using native fetch", async () => {
    const s = setup();
    vi.stubGlobal("fetch", function(this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({sdp: "v=0", session: {instructions: "科小贝"}})));
    });
    const states: VideoCallState[] = [];
    const call = new RealtimeVideoCall({audio: s.audio as unknown as HTMLAudioElement, onState: state => states.push(state), onPreview: vi.fn(),
      getUserMedia: s.getUserMedia, createPeer: () => s.peer as unknown as RTCPeerConnection});
    await call.start();
    expect(states.at(-1)?.phase).toBe("connecting");
    expect(s.peer.setRemoteDescription).toHaveBeenCalledWith({type: "answer", sdp: "v=0"});
    call.stop();
  });
  it("releases permission results that arrive after hangup", async () => {
    const s = setup(); let resolve!: (s: MediaStream) => void;
    s.getUserMedia.mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    const start = s.call.start(); s.call.stop(); resolve(s.capture as unknown as MediaStream); await start;
    expect(s.capture.tracks.every(t => t.stop.mock.calls.length === 1)).toBe(true);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("stops all media and closes the peer when the network fails", async () => {
    const s = setup(); await s.call.start(); s.peer.connectionState = "failed"; s.peer.onconnectionstatechange?.();
    expect(s.peer.close).toHaveBeenCalled(); expect(s.capture.tracks.every(t => t.stop.mock.calls.length === 1)).toBe(true);
    expect(s.states.at(-1)?.phase).toBe("error");
  });
  it("sets session once across server and client channels and waits for acknowledgement", async () => {
    const s = setup(); await s.call.start(); const remote = new Channel(); remote.label = "txt";
    s.peer.ondatachannel?.({channel: remote}); remote.event({type: "session.created"});
    const events = [...s.peer.channel.sent, ...remote.sent];
    expect(events.filter(e => e.type === "session.update")).toHaveLength(1);
    expect(s.states.at(-1)?.phase).toBe("connecting");
    remote.event({type: "session.updated"}); expect(s.states.at(-1)?.phase).toBe("listening");
    s.call.stop();
  });
  it("interrupts old replies and ignores late subtitles from a cancelled response", async () => {
    const s = setup(); await s.call.start(); const ch = s.peer.channel;
    ch.event({type: "session.updated"}); ch.event({type: "response.created", response: {id: "old"}});
    ch.event({type: "response.audio_transcript.delta", response_id: "old", delta: "这是"});
    ch.event({type: "input_audio_buffer.speech_started"});
    ch.event({type: "response.audio_transcript.delta", response_id: "old", delta: "旧回复"});
    expect(s.states.at(-1)?.assistant).toBe(""); expect(s.audio.muted).toBe(true);
    ch.event({type: "response.created", response: {id: "new"}});
    ch.event({type: "response.audio_transcript.delta", response_id: "new", delta: "一片叶子"});
    expect(s.audio.muted).toBe(false);
    ch.event({type: "response.audio_transcript.done", response_id: "new", transcript: "一片叶子"});
    expect(s.turns).toEqual([{role: "assistant", text: "一片叶子"}]); s.call.stop();
  });
  it("actually stops the camera and reacquires it when enabled", async () => {
    vi.useFakeTimers(); const s = setup(); await s.call.start(); s.peer.channel.event({type: "session.updated"}); await vi.advanceTimersByTimeAsync(500); await s.call.toggleCamera();
    expect(s.capture.getVideoTracks()[0].stop).toHaveBeenCalled();
    expect(s.peer.senders[1].track).toBeNull();
    const next = stream(); s.getUserMedia.mockResolvedValueOnce(next as unknown as MediaStream);
    await s.call.toggleCamera(); expect(s.peer.senders[1].track).toBe(next.getVideoTracks()[0]); s.call.stop();
  });
  it("cannot restart while an older permission request is still pending", async () => {
    const s = setup(); let resolve!: (s: MediaStream) => void;
    s.getUserMedia.mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    const first = s.call.start(); await s.call.start();
    expect(s.getUserMedia).toHaveBeenCalledTimes(1);
    s.call.stop(); resolve(s.capture as unknown as MediaStream); await first;
  });
  it("does not enable media until the provider confirms the session", async () => {
    const s = setup(); await s.call.start();
    expect(s.capture.tracks.every(t => !t.enabled)).toBe(true);
    s.peer.channel.event({type: "session.updated"});
    expect(s.capture.tracks.every(t => t.enabled)).toBe(true);
    s.call.toggleMicrophone(); expect(s.capture.getAudioTracks()[0].enabled).toBe(false);
    s.call.stop();
  });
  it("cleans up when initial SDP exchange fails", async () => {
    const s = setup(); s.fetcher.mockResolvedValueOnce(new Response("unavailable", {status: 503}));
    await s.call.start(); expect(s.states.at(-1)?.phase).toBe("error");
    expect(s.capture.tracks.every(t => t.stop.mock.calls.length === 1)).toBe(true);
  });
  it("releases a replacement camera granted after hangup", async () => {
    vi.useFakeTimers(); const s = setup(); await s.call.start(); s.peer.channel.event({type: "session.updated"}); await vi.advanceTimersByTimeAsync(500);
    const replacement = stream(); let resolve!: (s: MediaStream) => void;
    s.getUserMedia.mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    const replacing = s.call.switchCamera(); await Promise.resolve(); s.call.stop();
    resolve(replacement as unknown as MediaStream); await replacing;
    expect(replacement.tracks.every(t => t.stop.mock.calls.length === 1)).toBe(true);
    expect(s.states.at(-1)?.phase).toBe("ended");
  });
  it("discards tool results arriving after the user interrupts", async () => {
    const s = setup(); await s.call.start(); const ch = s.peer.channel;
    ch.event({type: "session.updated"}); ch.event({type: "response.created", response: {id: "tool-response"}});
    let resolve!: (r: Response) => void;
    s.fetcher.mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    ch.event({type: "response.function_call_arguments.done", name: "search_science_resources", call_id: "call-1", arguments: '{"query":"风"}'});
    ch.event({type: "response.done", response: {id: "tool-response"}});
    ch.event({type: "input_audio_buffer.speech_started"});
    resolve(new Response(JSON.stringify({evidence: "旧资料", labLinks: []})));
    await new Promise(r => setTimeout(r, 0));
    expect(ch.sent.filter(e => e.type === "conversation.item.create")).toHaveLength(0); s.call.stop();
  });
  it("does not replace the ended UI with a late camera-off result", async () => {
    vi.useFakeTimers(); const s = setup(); await s.call.start(); s.peer.channel.event({type: "session.updated"}); await vi.advanceTimersByTimeAsync(500);
    let resolve!: () => void;
    s.peer.senders[1].replaceTrack.mockImplementationOnce(() => new Promise<void>(r => {resolve = r;}));
    const closing = s.call.toggleCamera(); s.call.stop(); resolve(); await closing;
    expect(s.states.at(-1)?.phase).toBe("ended");
    expect(s.states.at(-1)?.notice).toBe("通话已结束");
  });
  it("runs a new tool request even while an interrupted request is pending", async () => {
    const s = setup(); await s.call.start(); const ch = s.peer.channel;
    ch.event({type: "session.updated"}); ch.event({type: "response.created", response: {id: "old-tool"}});
    let resolveOld!: (r: Response) => void;
    s.fetcher.mockImplementationOnce(() => new Promise(r => {resolveOld = r;}));
    ch.event({type: "response.function_call_arguments.done", name: "search_science_resources", call_id: "old-call", arguments: '{"query":"风"}'});
    ch.event({type: "response.done", response: {id: "old-tool"}});
    ch.event({type: "input_audio_buffer.speech_started"});
    ch.event({type: "response.created", response: {id: "new-tool"}});
    ch.event({type: "response.function_call_arguments.done", name: "search_science_resources", call_id: "new-call", arguments: '{"query":"磁铁"}'});
    ch.event({type: "response.done", response: {id: "new-tool"}});
    await new Promise(r => setTimeout(r, 0));
    resolveOld(new Response(JSON.stringify({evidence: "旧资料", labLinks: []})));
    await new Promise(r => setTimeout(r, 0));
    const outputs = ch.sent.filter(e => e.type === "conversation.item.create");
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({item: {call_id: "new-call", output: "资料"}}); s.call.stop();
  });
  it("blocks camera reopening until the previous detach finishes", async () => {
    vi.useFakeTimers(); const s = setup(); await s.call.start(); s.peer.channel.event({type: "session.updated"}); await vi.advanceTimersByTimeAsync(500);
    let resolve!: () => void;
    s.peer.senders[1].replaceTrack.mockImplementationOnce(() => new Promise<void>(r => {resolve = r;}));
    const off = s.call.toggleCamera(); await s.call.toggleCamera();
    expect(s.getUserMedia).toHaveBeenCalledTimes(1);
    resolve(); await off; expect(s.states.at(-1)?.camera).toBe(false); s.call.stop();
  });
});
