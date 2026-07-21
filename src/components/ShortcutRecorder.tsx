import { useEffect, useMemo, useState } from "react";
import {
  formatKeySegments,
  getShortcutList,
  setShortcutCaptureActive,
  shortcutFromEvent,
} from "../lib/shortcuts";
import { useCheatsheet } from "../store/cheatsheet";
import { useVoice } from "../store/voice";
import { Icon } from "./icons";
import "./ShortcutEditor.css";

interface ShortcutRecorderProps {
  id: string;
  value: string | null;
  onChange: (accelerator: string | null) => void;
  compact?: boolean;
  ariaLabel?: string;
}

function normalized(accelerator: string): string {
  return accelerator.trim().toLowerCase();
}

export function ShortcutRecorder({
  id,
  value,
  onChange,
  compact = false,
  ariaLabel = "Record shortcut",
}: ShortcutRecorderProps) {
  const recordingId = useCheatsheet((state) => state.recordingId);
  const setRecordingId = useCheatsheet((state) => state.setRecordingId);
  const touch = useCheatsheet((state) => state.touch);
  const revision = useCheatsheet((state) => state.revision);
  const voiceToggle = useVoice((state) => state.toggleShortcut);
  const voiceHold = useVoice((state) => state.holdShortcut);
  const [conflict, setConflict] = useState<string | null>(null);
  const recording = recordingId === id;

  const usedShortcuts = useMemo(() => {
    const items = getShortcutList().flatMap((group) => group.items);
    const byId = new Map(items.map((item) => [item.id, { id: item.id, label: item.description, keys: item.keys }]));
    if (voiceToggle) byId.set("voice.toggle", { id: "voice.toggle", label: "Toggle voice recording", keys: voiceToggle });
    if (voiceHold) byId.set("voice.hold", { id: "voice.hold", label: "Hold to talk", keys: voiceHold });
    return [...byId.values()];
  }, [revision, voiceToggle, voiceHold]);

  useEffect(() => {
    if (!recording) return;
    setShortcutCaptureActive(true);

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;

      if (event.key === "Escape") {
        setConflict(null);
        setRecordingId(null);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete")
        && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        onChange(null);
        touch();
        setConflict(null);
        setRecordingId(null);
        return;
      }

      const accelerator = shortcutFromEvent(event);
      if (!accelerator) return;
      const duplicate = usedShortcuts.find((item) => item.id !== id && normalized(item.keys) === normalized(accelerator));
      if (duplicate) {
        setConflict(`Already used by ${duplicate.label}`);
        return;
      }

      onChange(accelerator);
      touch();
      setConflict(null);
      setRecordingId(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      setShortcutCaptureActive(false);
    };
  }, [id, onChange, recording, setRecordingId, touch, usedShortcuts]);

  useEffect(() => {
    if (!recording) setConflict(null);
  }, [recording]);

  return (
    <div className={`shortcut-recorder${compact ? " compact" : ""}`} data-recording={recording || undefined}>
      <button
        type="button"
        className="shortcut-record-button"
        aria-label={recording ? "Waiting for shortcut" : ariaLabel}
        aria-pressed={recording}
        onClick={() => setRecordingId(recording ? null : id)}
      >
        <span className="shortcut-record-keys" aria-live="polite">
          {recording ? (
            <span className="shortcut-record-prompt">Press keys</span>
          ) : value ? (
            formatKeySegments(value).map((segment, index) => <kbd className="kbd" key={`${segment}-${index}`}>{segment}</kbd>)
          ) : (
            <span className="shortcut-record-empty">Not set</span>
          )}
        </span>
        <Icon name="ic-keyboard" size="xs" />
      </button>
      {recording && <span className="shortcut-record-help">Esc cancels. Backspace resets.</span>}
      {conflict && <span className="shortcut-record-conflict" role="alert"><Icon name="ic-alert" size="xs" />{conflict}</span>}
    </div>
  );
}
