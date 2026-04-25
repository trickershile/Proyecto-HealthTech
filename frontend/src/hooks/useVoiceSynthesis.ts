"use client";
import { useCallback, useState, useRef } from "react";

export const useVoiceSynthesis = () => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const animationRef = useRef<number>();
  const levelRef = useRef(0);
  const targetRef = useRef(0);
  const lastTickRef = useRef(0);
  const boundarySeenRef = useRef(false);
  const fallbackIntervalRef = useRef<number>();
  const runIdRef = useRef(0);

  const getPreferredVoice = useCallback(async () => {
    if (!("speechSynthesis" in window)) return null;

    const pick = (voices: SpeechSynthesisVoice[]) => {
      const byName = (needle: string) => (v: SpeechSynthesisVoice) =>
        v.lang.toLowerCase().startsWith("es") && v.name.toLowerCase().includes(needle);

      return (
        voices.find(byName("google")) ||
        voices.find(byName("natural")) ||
        voices.find((v) => v.lang === "es-ES" || v.lang === "es_ES") ||
        voices.find((v) => v.lang.toLowerCase().startsWith("es")) ||
        null
      );
    };

    const initial = window.speechSynthesis.getVoices();
    const direct = pick(initial);
    if (direct) return direct;

    const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      const onVoicesChanged = () => finish();
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      window.setTimeout(finish, 600);
    });

    return pick(voices);
  }, []);

  const chunkText = useCallback((text: string) => {
    const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
    if (!normalized) return [];

    const parts = normalized.split(/(?<=[.!?;:])\s+/g);
    const chunks: string[] = [];
    let buf = "";
    for (const part of parts) {
      if (!part) continue;
      const next = buf ? `${buf} ${part}` : part;
      if (next.length <= 180) {
        buf = next;
        continue;
      }
      if (buf) chunks.push(buf);
      if (part.length <= 180) {
        buf = part;
      } else {
        let i = 0;
        while (i < part.length) {
          chunks.push(part.slice(i, i + 180));
          i += 180;
        }
        buf = "";
      }
    }
    if (buf) chunks.push(buf);
    return chunks;
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      console.warn("Speech synthesis is not supported in this browser.");
      if (onEnd) onEnd();
      return;
    }

    runIdRef.current += 1;
    const runId = runIdRef.current;
    window.speechSynthesis.cancel();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
    boundarySeenRef.current = false;
    levelRef.current = 0;
    targetRef.current = 0;

    setIsSpeaking(true);
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      if (runIdRef.current !== runId) return;
      if (!window.speechSynthesis.speaking) {
        if (window.speechSynthesis.pending) {
          setAudioLevel(0);
          levelRef.current = 0;
          targetRef.current = 0;
          animationRef.current = requestAnimationFrame(tick);
          return;
        }

        setAudioLevel(0);
        levelRef.current = 0;
        targetRef.current = 0;
        setIsSpeaking(false);
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;

      targetRef.current *= Math.exp(-dt * 8.0);
      levelRef.current += (targetRef.current - levelRef.current) * (1 - Math.exp(-dt * 28.0));

      const nextLevel = Math.max(0, Math.min(1, levelRef.current));
      setAudioLevel(nextLevel);

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    fallbackIntervalRef.current = window.setInterval(() => {
      if (runIdRef.current !== runId) return;
      if (!window.speechSynthesis.speaking) return;
      if (!boundarySeenRef.current) {
        targetRef.current = 0.65;
      }
    }, 260);

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      setIsSpeaking(false);
      if (onEnd) onEnd();
      return;
    }

    (async () => {
      const voice = await getPreferredVoice();
      if (runIdRef.current !== runId) return;

      let idx = 0;
      const speakNext = () => {
        if (runIdRef.current !== runId) return;
        if (idx >= chunks.length) {
          setAudioLevel(0);
          setIsSpeaking(false);
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
          if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
          levelRef.current = 0;
          targetRef.current = 0;
          if (onEnd) onEnd();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        utterance.lang = "es-ES";
        if (voice) utterance.voice = voice;
        utterance.rate = 0.9;
        utterance.pitch = 0.82;
        utterance.volume = 0.95;

        utterance.onboundary = () => {
          if (runIdRef.current !== runId) return;
          boundarySeenRef.current = true;
          targetRef.current = 0.9;
        };

        utterance.onend = () => {
          if (runIdRef.current !== runId) return;
          boundarySeenRef.current = false;
          targetRef.current = 0;
          idx += 1;
          window.setTimeout(speakNext, 120);
        };

        utterance.onerror = () => {
          if (runIdRef.current !== runId) return;
          idx += 1;
          window.setTimeout(speakNext, 120);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    })();
  }, [chunkText, getPreferredVoice]);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    window.speechSynthesis.cancel();
    setAudioLevel(0);
    setIsSpeaking(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (fallbackIntervalRef.current) window.clearInterval(fallbackIntervalRef.current);
    levelRef.current = 0;
    targetRef.current = 0;
  }, []);

  return { speak, stop, audioLevel, isSpeaking };
};
