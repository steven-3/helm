import { useEffect, useMemo, useRef, useState } from "react";
import { useVoice } from "../store/voice";
import "./VoiceMode.css";

export function VoiceWaveform({
  bars = 32,
  active,
  className = "",
}: {
  bars?: number;
  active?: boolean;
  className?: string;
}) {
  const phase = useVoice((state) => state.phase);
  const level = useVoice((state) => state.level);
  const isActive = active ?? phase === "recording";
  const levelRef = useRef(level);
  const idle = useMemo(
    () => Array.from({ length: bars }, (_, index) => 0.07 + ((index * 7) % 5) * 0.012),
    [bars],
  );
  const [history, setHistory] = useState<number[]>(idle);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    if (!isActive) {
      setHistory(idle);
      return;
    }
    let frame = 0;
    const sample = () => {
      const nextLevel = Math.max(0.055, Math.min(1, levelRef.current));
      setHistory((current) => [...current.slice(-(bars - 1)), nextLevel]);
      frame = window.requestAnimationFrame(sample);
    };
    frame = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(frame);
  }, [bars, idle, isActive]);

  const width = bars * 3 - 1;
  return (
    <svg
      className={`voice-waveform${isActive ? " active" : ""}${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${width} 28`}
      preserveAspectRatio="none"
      role="img"
      aria-label={isActive ? "Live microphone level" : "Microphone idle"}
    >
      {history.map((sample, index) => {
        const height = Math.max(2, Math.round(sample * 24));
        return (
          <rect
            key={index}
            x={index * 3}
            y={(28 - height) / 2}
            width="2"
            height={height}
            rx="1"
          />
        );
      })}
    </svg>
  );
}
