"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {Camera, CameraOff, Mic, MicOff, PhoneOff, RefreshCw, Video, Volume2, VolumeX, X} from "lucide-react";
import {BrandLogo} from "./BrandLogo";
import {RealtimeVideoCall, initialVideoCallState, type VideoResourceLink} from "@/lib/realtime-video-call";
import styles from "./VideoCallPanel.module.css";

type Props = {onClose: () => void; onTurn: (turn: {role: "user" | "assistant"; text: string}) => void; onResources: (links: VideoResourceLink[]) => void};

export function VideoCallPanel({onClose, onTurn, onResources}: Props) {
  const [state, setState] = useState(initialVideoCallState);
  const [availability, setAvailability] = useState<"checking" | "ready" | "unavailable">("checking");
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<RealtimeVideoCall | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const callbacks = useRef({onTurn, onResources});
  useEffect(() => {closeRef.current = onClose; callbacks.current = {onTurn, onResources};}, [onClose, onTurn, onResources]);
  const close = useCallback(() => {callRef.current?.stop(); closeRef.current();}, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controller = new AbortController();
    let mounted = true;
    rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
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
      callRef.current?.stop(); callRef.current = null; previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (video) {video.srcObject = preview; if (preview) void video.play().catch(() => {});}
    return () => {if (video) video.srcObject = null;};
  }, [preview]);

  const start = () => {
    if (!audioRef.current || availability !== "ready") return;
    callRef.current?.stop();
    const call = new RealtimeVideoCall({audio: audioRef.current, onState: setState, onPreview: setPreview,
      onTurn: turn => callbacks.current.onTurn(turn), onResources: links => callbacks.current.onResources(links)});
    callRef.current = call; void call.start();
  };
  const active = ["preparing", "connecting", "listening", "thinking", "speaking"].includes(state.phase);
  const connected = ["listening", "thinking", "speaking"].includes(state.phase);
  const status = {idle: "视频通话", preparing: "准备设备", connecting: "正在接通", listening: "正在聆听", thinking: "正在思考", speaking: "正在回答", ended: "通话结束", error: "连接未成功"}[state.phase];

  return createPortal(<div className={styles.backdrop}><section ref={rootRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="科小贝视频通话"
    onKeyDown={event => {
      if (event.key === "Escape") {event.preventDefault(); close();}
      if (event.key === "Tab") {
        const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled), a[href]");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      }
    }}>
    <header className={styles.header}>
      <div className={styles.identity}><BrandLogo size={30} /><div><strong>科小贝</strong><span>和你一起看见科学</span></div></div>
      <button className={styles.iconButton} type="button" onClick={close} aria-label="关闭视频通话"><X size={20} /></button>
    </header>
    <div className={styles.stage}>
      <video ref={videoRef} autoPlay muted playsInline className={`${styles.preview} ${state.facing === "user" ? styles.mirrored : ""}`} aria-label="本机摄像头画面" />
      {!preview ? <div className={styles.empty}>
        <div className={styles.cameraMark}>{active && !state.camera ? <CameraOff size={30} /> : <Video size={32} />}</div>
        <h3>{active ? "摄像头已关闭" : "把好奇的事，给我看看"}</h3>
        <p>{active ? "你仍然可以和科小贝语音聊天" : "一片叶子、一块磁铁，或一个新发现"}</p>
      </div> : null}
      <div className={styles.badge}><span className={connected ? styles.live : ""} />{status}</div>
      {preview ? <button type="button" className={styles.flip} disabled={state.cameraBusy || !connected} onClick={() => void callRef.current?.switchCamera()} aria-label="切换前后摄像头"><RefreshCw size={18} /></button> : null}
    </div>
    <div className={styles.body}>
      <p className={styles.notice} role="status">{state.notice}</p>
      {availability === "checking" ? <p className={styles.helper}>正在检查视频通话服务…</p> : null}
      {availability === "unavailable" ? <div className={styles.unavailable}><strong>视频通话暂未就绪</strong><p>你可以先使用语音或文字对话，视频服务准备好后就能在这里拨打。</p></div> : null}
      <div className={styles.captions} aria-label="视频通话字幕" aria-live="polite" aria-atomic="true">
        {state.user ? <p className={styles.userCaption}><span>你</span>{state.user}</p> : null}
        {state.assistant ? <p className={styles.assistantCaption}><span>科小贝</span>{state.assistant}</p> : null}
      </div>
      {!active ? <>
        <button ref={startRef} type="button" className={styles.start} disabled={availability !== "ready"} onClick={start}><Video size={19} />{state.phase === "idle" ? "开始视频通话" : "重新拨打"}</button>
        <p className={styles.privacy}>通话时会将声音和画面发送给 AI 理解，应用不保存原始音视频。挂断后停止采集。</p>
      </> : <>
        {connected ? <button type="button" className={styles.interrupt} onClick={() => callRef.current?.interrupt()}>打断重说</button> : null}
        <div className={styles.controls}>
          <button type="button" disabled={!connected} aria-label={state.microphone ? "静音麦克风" : "开启麦克风"} aria-pressed={!state.microphone} onClick={() => callRef.current?.toggleMicrophone()}>{state.microphone ? <Mic size={21} /> : <MicOff size={21} />}<span>{state.microphone ? "静音" : "已静音"}</span></button>
          <button type="button" disabled={!connected || state.cameraBusy} aria-label={state.camera ? "关闭摄像头" : "开启摄像头"} aria-pressed={state.camera} onClick={() => void callRef.current?.toggleCamera()}>{state.camera ? <Camera size={21} /> : <CameraOff size={21} />}<span>{state.cameraBusy ? "切换中" : state.camera ? "摄像头" : "已关闭"}</span></button>
          <button type="button" className={styles.hangup} aria-label="挂断视频通话" onClick={() => callRef.current?.stop()}><PhoneOff size={21} /><span>挂断</span></button>
          <button type="button" disabled={!connected} aria-label={state.speaker ? "关闭扬声器" : "开启扬声器"} aria-pressed={state.speaker} onClick={() => void callRef.current?.toggleSpeaker()}>{state.speaker ? <Volume2 size={21} /> : <VolumeX size={21} />}<span>扬声器</span></button>
        </div>
      </>}
      <button type="button" className={styles.back} onClick={close}>返回文字对话</button>
    </div>
    <audio ref={audioRef} autoPlay playsInline />
  </section></div>, document.body);
}
