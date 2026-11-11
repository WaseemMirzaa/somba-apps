"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { isSoundOn, setSoundOn } from "@/lib/notification-sound";

/** "Notification sound" on/off, a real switch. Saved per browser (localStorage), default on. */
export function SoundSwitch({ className = "" }: { className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => setOn(isSoundOn());
    const id = window.setTimeout(read, 0); // the saved value is unknown while the page is rendered on the server
    window.addEventListener("somba-sound-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("somba-sound-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const label = fr ? "Son des notifications" : "Notification sound";
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="sound-switch">
      {on ? <Volume2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> : <VolumeX className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
      <span id="sound-switch-label" className="flex-1 text-xs font-medium text-slate-700">
        {label}
        <span className="ml-1 text-slate-400">{on ? (fr ? "(activé)" : "(on)") : fr ? "(désactivé)" : "(off)"}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="sound-switch-label"
        onClick={() => {
          setSoundOn(!on);
          setOn(!on);
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
