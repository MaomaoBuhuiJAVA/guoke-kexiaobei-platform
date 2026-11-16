"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {CameraOff, Captions, Ellipsis, Mic, MicOff, PhoneOff, SwitchCamera, Video, Volume2, VolumeX, X} from "lucide-react";
import {RealtimeVideoCall, initialVideoCallState, type VideoResourceLink} from "@/lib/realtime-video-call";
import styles from "./VideoCallPanel.module.css";

type Turn = {role: "user" | "assistant"; text: string};
type Props = {onClose: () => void; onTurn: (turn: Turn) => void; onResources: (links: VideoResourceLink[]) => void};

export function VideoCallPanel({onClose, onTurn, onResources}: Props) {
  const [state, setState] = useState(initialVideoCallState);
  const [availability, setAvailability] = useState<"checking" | "ready" | "unavailable">("checking");
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<RealtimeVideoCall | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const userCaptionRef = useRef<HTMLParagraphElement>(null);
  const assistantCaptionRef = useRef<HTMLParagraphElement>(null);
  const connectedAtRef = useRef<number | null>(null);
  const closeRef = useRef(onClose);
  const callbacks = useRef({onTurn, onResources});
  const active = ["preparing", "connecting", "listening", "thinking", "speaking"].includes(state.phase);
  const connected = ["listening", "thinking", "speaking"].includes(state.phase);
  const status = {idle: "视频通话", preparing: "准备设备", connecting: "正在接通", listening: "正在聆听", thinking: "正在思考", speaking: "正在回答", ended: "通话结束", error: "连接未成功"}[state.phase];

  useEffect(() => {closeRef.current = onClose; callbacks.current = {onTurn, onResources};}, [onClose, onTurn, onResources]);
  const close = useCallback(() => {callRef.current?.stop(); closeRef.current();}, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const backdrop = rootRef.current?.parentElement;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const previousInert = siblings.map(node => node.inert);
    siblings.forEach(node => {node.inert = true;});
    document.body.style.overflow = "hidden";
    const controller = new AbortController();
    let mounted = true;
    historyButtonRef.current?.focus();
    const check = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
          if (mounted) {setAvailability("unavailable"); setState(s => ({...s, notice: "当前浏览器暂不支持视频通话，请使用最新版 Chrome 或 Safari 打开。"}));} return;
        }
        const response = await fetch("/api/video-call/session", {signal: controller.signal, cache: "no-store"});
        const result = response.ok ? await response.json() : null;
        if (mounted) setAvailability(result?.available ? "ready" : "unavailable");
      } catch {if (mounted) setAvailability("unavailable");}
    };
    void check();
    const hidden = () => {if (document.hidden) callRef.current?.stop();};
    const leave = () => callRef.current?.stop();
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", leave);
    return () => {
      mounted = false; controller.abort();
      document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", leave);
      callRef.current?.stop(); callRef.current = null;
      document.body.style.overflow = previousOverflow;
      siblings.forEach((node, index) => {node.inert = previousInert[index];});
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (video) {video.srcObject = preview; if (preview) void video.play().catch(() => {});}
    return () => {if (video) video.srcObject = null;};
  }, [preview]);
  useEffect(() => {
    if (!connected) return;
    connectedAtRef.current ??= Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - connectedAtRef.current!) / 1000));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    const elements = [userCaptionRef.current, assistantCaptionRef.current].filter((element): element is HTMLParagraphElement => element !== null);
    const scrollToLatest = () => elements.forEach(element => {element.scrollTop = element.scrollHeight;});
    scrollToLatest();
    const observer = new ResizeObserver(scrollToLatest);
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [state.user, state.assistant, captionsEnabled]);
  useEffect(() => {
    if (historyOpen) historyRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [historyOpen]);

  const start = () => {
    if (!audioRef.current || availability !== "ready") return;
    callRef.current?.stop(); connectedAtRef.current = null; setElapsed(0);
    const call = new RealtimeVideoCall({audio: audioRef.current, onState: setState, onPreview: setPreview,
      onTurn: turn => {setTurns(current => [...current, turn].slice(-80)); callbacks.current.onTurn(turn);},
      onResources: links => callbacks.current.onResources(links)});
    callRef.current = call; void call.start();
  };
  const closeHistory = () => {setHistoryOpen(false); historyButtonRef.current?.focus();};
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return createPortal(<div className={styles.backdrop}><section ref={rootRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="科小贝视频通话"
    onKeyDown={event => {
      if (event.key === "Escape") {event.preventDefault(); if (historyOpen) closeHistory(); else close();}
      if (event.key === "Tab") {
        const container = historyOpen ? historyRef.current : rootRef.current;
        const buttons = Array.from(container?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []).filter(element => element.getClientRects().length);
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      }
    }}>
    <div className={styles.stage}>
      <video ref={videoRef} autoPlay muted playsInline className={`${styles.preview} ${state.facing === "user" ? styles.mirrored : ""}`} aria-label="本机摄像头画面" />
      {!preview ? <div className={styles.empty}>
        <div className={styles.cameraMark}>{active && !state.camera ? <CameraOff size={36} /> : <Video size={38} />}</div>
        <h2>{active ? "摄像头已关闭" : "把好奇的事，给我看看"}</h2>
        <p>{active ? "你仍然可以和科小贝语音聊天" : "一片叶子、一块磁铁，或一个新发现"}</p>
      </div> : null}
    </div>
    <div className={styles.shade} aria-hidden="true" />
    <header className={styles.header}>
      <div className={styles.topline}><span className={styles.identity}><i className={connected ? styles.live : ""} />科小贝 · {status}</span><span className={styles.duration} aria-label={`通话时长 ${duration}`}>{duration}</span></div>
      <div className={styles.tools}>
        <button ref={historyButtonRef} className={styles.tool} type="button" onClick={() => setHistoryOpen(true)} aria-label="查看本次对话记录" aria-expanded={historyOpen}><Ellipsis size={24} /></button>
        <div className={styles.rightTools}>
          <button type="button" className={styles.tool} disabled={state.cameraBusy || !connected} onClick={() => void callRef.current?.switchCamera()} aria-label="切换前后摄像头"><SwitchCamera size={22} /></button>
          <button type="button" className={styles.tool} onClick={() => setCaptionsEnabled(enabled => !enabled)} aria-label={captionsEnabled ? "隐藏实时字幕" : "显示实时字幕"} aria-pressed={captionsEnabled}><Captions size={24} /></button>
        </div>
      </div>
    </header>
    <div className={styles.bottom}>
      <div className={styles.conversation}>
        <p className={styles.notice} role="status"><span className={`${styles.wave} ${state.phase === "speaking" ? styles.speaking : ""}`} aria-hidden="true"><i /><i /><i /></span>{availability === "checking" ? "正在检查视频通话服务…" : state.notice}</p>
        {availability === "unavailable" ? <p className={styles.unavailable}>视频通话暂未就绪，你可以先使用语音或文字对话。</p> : null}
        {captionsEnabled ? <div className={styles.captions} aria-label="视频通话字幕" aria-live="polite" aria-atomic="true">
          {state.user ? <p ref={userCaptionRef} className={styles.userCaption}>你：{state.user}</p> : null}
          {state.assistant ? <p ref={assistantCaptionRef} className={styles.assistantCaption}>{state.assistant}</p> : null}
        </div> : null}
        {connected && (state.phase === "thinking" || state.phase === "speaking") ? <button type="button" className={styles.interrupt} onClick={() => callRef.current?.interrupt()}>打断重说</button> : null}
        {!active ? <button type="button" className={styles.start} disabled={availability !== "ready"} onClick={start}><Video size={20} />{state.phase === "idle" ? "开始视频通话" : "重新拨打"}</button> : null}
      </div>
      <div className={styles.controls} aria-label="通话控制">
        <button type="button" className={styles.control} disabled={!connected} aria-label={state.microphone ? "静音麦克风" : "开启麦克风"} aria-pressed={state.microphone} onClick={() => callRef.current?.toggleMicrophone()}><span className={styles.circle}>{state.microphone ? <Mic /> : <MicOff />}</span><span>{state.microphone ? "麦克风" : "已静音"}</span></button>
        <button type="button" className={styles.control} disabled={!connected} aria-label={state.speaker ? "关闭扬声器" : "开启扬声器"} aria-pressed={state.speaker} onClick={() => void callRef.current?.toggleSpeaker()}><span className={styles.circle}>{state.speaker ? <Volume2 /> : <VolumeX />}</span><span>扬声器</span></button>
        <button type="button" className={styles.control} disabled={!connected || state.cameraBusy} aria-label={state.camera ? "关闭摄像头" : "开启摄像头"} aria-pressed={state.camera} onClick={() => void callRef.current?.toggleCamera()}><span className={styles.circle}>{state.camera ? <Video /> : <CameraOff />}</span><span>{state.cameraBusy ? "切换中" : state.camera ? "摄像头" : "已关闭"}</span></button>
        <button type="button" className={`${styles.control} ${styles.hangup}`} aria-label={active ? "挂断视频通话" : "关闭视频通话"} onClick={() => active ? callRef.current?.stop() : close()}><span className={styles.circle}><PhoneOff /></span><span>{active ? "挂断" : "退出"}</span></button>
      </div>
      <p className={styles.disclaimer}>{active ? "内容由 AI 生成" : "通话时声音和画面会发送给 AI，应用不保存原始音视频。挂断后停止采集。"}</p>
    </div>
    {historyOpen ? <div className={styles.historyBackdrop} onClick={closeHistory}><aside ref={historyRef} className={styles.history} aria-label="本次视频对话记录" onClick={event => event.stopPropagation()}>
      <header><h2>本次对话</h2><button type="button" className={styles.historyClose} onClick={closeHistory} aria-label="关闭对话记录"><X size={22} /></button></header>
      <div className={styles.historyMessages}>{turns.length ? turns.map((turn, index) => <p key={index}><span>{turn.role === "user" ? "你" : "科小贝"}</span>{turn.text}</p>) : <p className={styles.noHistory}>开始通话后，已完成的对话会显示在这里。</p>}</div>
      <button type="button" className={styles.returnToChat} onClick={close}>返回文字对话</button>
    </aside></div> : null}
    <audio ref={audioRef} autoPlay playsInline />
  </section></div>, document.body);
}
