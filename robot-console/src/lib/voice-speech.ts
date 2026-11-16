import {normalizeVoiceCallReply, voiceCallSpeechText, type VoiceReplyMode} from "./voice-call";

function waitForSpeechRetry(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {reject(new DOMException("Aborted", "AbortError"));return;}
    const onAbort = () => {clearTimeout(timer);reject(new DOMException("Aborted", "AbortError"));};
    const timer = setTimeout(() => {signal.removeEventListener("abort", onAbort);resolve();}, milliseconds);
    signal.addEventListener("abort", onAbort, {once:true});
  });
}

/** Recover transient provider errors without replaying already spoken clips. */
export async function requestVoiceSpeech(text: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    let response: Response;
    try {
      response = await fetchImpl("/api/voice/tts", {
        method:"POST", signal, headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text,voiceCall:true}),
      });
      if (response.ok) return await response.blob();
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      await waitForSpeechRetry(signal, 400 * (attempt + 1));
      continue;
    }
    await response.body?.cancel();
    if (attempt === 2 || response.status !== 429 && response.status < 500) throw new Error("TTS request failed");
    await waitForSpeechRetry(signal, 400 * (attempt + 1));
  }
  throw new Error("TTS request failed");
}

/** Synthesize each stable phrase during generation, with one clip of lookahead. */
export function createVoiceSpeechQueue<Audio>({signal: parentSignal, mode = "brief", prepare, play}: {
  signal?: AbortSignal;
  mode?: VoiceReplyMode;
  prepare: (text: string, signal: AbortSignal) => Promise<Audio>;
  play: (audio: Audio, text: string, signal: AbortSignal) => Promise<boolean>;
}) {
  const controller = new AbortController(), signal = controller.signal;
  const cancel = () => {controller.abort(); parentSignal?.removeEventListener("abort", cancel);};
  if (parentSignal?.aborted) cancel(); else parentSignal?.addEventListener("abort", cancel, {once: true});
  let raw = "", queued = "", finalized = false, currentIndex = 0, preparationIndex = 0;
  let playback: Promise<boolean> = Promise.resolve(true), completion: Promise<boolean> | undefined;
  type Prepared = {audio: Audio} | undefined;
  const clips: Array<{text: string; ready: Promise<Prepared>; resolve: (value: Prepared) => void}> = [];

  async function cancellable<T>(operation: Promise<T>): Promise<T | undefined> {
    if (signal.aborted) {void operation.catch(() => {}); return undefined;}
    let onAbort!: () => void;
    const cancelled = new Promise<undefined>(resolve => {
      onAbort = () => resolve(undefined);
      signal.addEventListener("abort", onAbort, {once: true});
    });
    try {return await Promise.race([operation, cancelled]);}
    finally {signal.removeEventListener("abort", onAbort);}
  }

  function prepareAhead() {
    while (!signal.aborted && preparationIndex < clips.length && preparationIndex < currentIndex + 2) {
      const clip = clips[preparationIndex++];
      try {void prepare(clip.text, signal).then(audio => clip.resolve({audio}), () => clip.resolve(undefined));}
      catch {clip.resolve(undefined);}
    }
  }

  function enqueue(text: string) {
    if (!text.trim() || signal.aborted) return;
    queued += text;
    let resolve!: (value: Prepared) => void;
    const ready = new Promise<Prepared>(done => {resolve = done;});
    const clip = {text, ready, resolve};
    const index = clips.push(clip) - 1;
    prepareAhead();
    playback = playback.then(async previousOk => {
      if (!previousOk || signal.aborted) return false;
      const prepared = await cancellable(clip.ready);
      if (!prepared || signal.aborted) {cancel(); return false;}
      let played: boolean | undefined;
      try {played = await cancellable(play(prepared.audio, text, signal));}
      catch {played = false;}
      if (played !== true || signal.aborted) {cancel(); return false;}
      currentIndex = index + 1;
      prepareAhead();
      return true;
    });
  }

  function flush(text: string, final: boolean) {
    if (!text.startsWith(queued)) {cancel(); return;}
    let remaining = text.slice(queued.length);
    while (remaining && !signal.aborted) {
      const characters = Array.from(remaining), first = !queued, grouped = !first && mode === "content", limit = first ? 32 : grouped ? 140 : 48;
      if (grouped && !final && characters.length < limit) break;
      const sentence = grouped
        ? characters.slice(0,limit).findLastIndex(character => /[。！？!?；;]/u.test(character)) + 1
        : characters.findIndex(character => /[。！？!?；;]/u.test(character)) + 1;
      let length = sentence && sentence <= limit ? sentence : 0;
      if (!length && first) {
        const pause = characters.findIndex((character, index) => index >= 7 && index < limit && /[，,：:]/u.test(character)) + 1;
        if (pause) length = pause;
      }
      // Leave enough trailing text that an incomplete word cannot change a committed prefix.
      if (!length && characters.length >= limit + 8) length = limit;
      if (!length && final) length = Math.min(limit, characters.length);
      if (!length) break;
      if (mode === "content") {
        // A quote following a sentence may arrive in the next model delta.
        if (!final && length === characters.length) break;
        while (length < characters.length && /[”’」』）》"']/u.test(characters[length])) length++;
        if (!final && length === characters.length) break;
      }
      const phrase = characters.slice(0, length).join("");
      enqueue(phrase);
      remaining = remaining.slice(phrase.length);
    }
  }

  return {
    push(delta: string) {
      if (finalized || signal.aborted) return;
      raw += delta;
      flush(voiceCallSpeechText(raw, mode), false);
    },
    finish(reply: string) {
      if (!finalized) {
        finalized = true;
        flush(normalizeVoiceCallReply(reply, mode), true);
        completion = playback.then(played => played && !signal.aborted).finally(() => {
          parentSignal?.removeEventListener("abort", cancel);
        });
      }
      return completion ?? Promise.resolve(false);
    },
    cancel,
  };
}
