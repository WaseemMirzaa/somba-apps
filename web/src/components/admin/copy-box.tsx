"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Shows a one-time secret (temporary password) in a copyable box with a warning. */
export function SecretBox({
  email,
  secret,
  fr = false,
  onDismiss,
  headline,
  note,
}: {
  email: string;
  secret: string;
  fr?: boolean;
  onDismiss: () => void;
  /** Replaces "Account created: email" (for example after a password re-issue). */
  headline?: string;
  /** Replaces the one-time-password warning. */
  note?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the text stays selectable */
    }
  }
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">
        {headline ?? `${fr ? "Compte créé : " : "Account created: "}${email}`}
      </p>
      <p className="mt-1">
        {note ??
          (fr
            ? "Mot de passe temporaire : il ne sera plus jamais affiché. Copiez-le maintenant et transmettez-le en privé ; la personne devra le remplacer à sa première connexion, avant toute autre action."
            : "Temporary password: it will not be shown again. Copy it now and hand it over privately; the person must replace it at first sign-in, before they can do anything else.")}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="select-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-900 ring-1 ring-amber-200">{secret}</code>
        <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-amber-200 hover:bg-amber-100">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier" : "Copy"}
        </button>
        <button onClick={onDismiss} className="ml-auto text-xs font-semibold text-amber-800 underline">
          {fr ? "J'ai copié, fermer" : "I copied it, dismiss"}
        </button>
      </div>
    </div>
  );
}
