"use client";
import { useEffect, useRef } from "react";

export function useAudioAnalyzer(active: boolean) {
  const audioVolumeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const stopAll = async () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      audioVolumeRef.current = 0;

      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {}
      }

      sourceRef.current = null;
      analyserRef.current = null;

      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch {}
      }
      audioContextRef.current = null;

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
      streamRef.current = null;
    };

    if (!active) {
      void stopAll();
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.85;
        analyserRef.current = analyser;

        source.connect(analyser);

        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length);
          audioVolumeRef.current = Math.min(1, rms * 2.2);
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        audioVolumeRef.current = 0;
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopAll();
    };
  }, [active]);

  return audioVolumeRef;
}
