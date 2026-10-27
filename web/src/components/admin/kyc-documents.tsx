"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

/** The id of a private document from its stored URL (`/api/v1/private-uploads/<id>`), or null. */
export function privateFileId(url: string): string | null {
  const m = /private-uploads\/([0-9a-zA-Z-]+)/.exec(url);
  return m ? m[1] : null;
}

/**
 * KYC papers are private files: nothing links to them directly. "Open" asks the server for a signed link
 * (`private:link`, valid 5 minutes, admins and the owner only) and opens it in a new tab.
 */
export function KycDocuments({ urls, fr }: { urls: string[]; fr: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(url: string) {
    const id = privateFileId(url);
    setError(null);
    if (!id) {
      setError(fr ? "Ce document n'est pas un fichier privé valide. Demandez au vendeur de le téléverser à nouveau." : "This document is not a valid private file. Ask the seller to upload it again.");
      return;
    }
    setBusy(url);
    try {
      const res = await socketClient.request<{ url: string; expiresAt: string }>("private:link", { id });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(`${fr ? "Impossible d'ouvrir le document : " : "Could not open the document: "}${errMsg(e)}`);
    } finally {
      setBusy(null);
    }
  }

  if (urls.length === 0) return <p className="text-sm text-slate-500">{fr ? "Aucun document." : "No documents."}</p>;
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <li key={url}>
            <Button size="sm" variant="secondary" disabled={busy === url} onClick={() => void open(url)} aria-label={fr ? `Ouvrir le document ${i + 1}` : `Open document ${i + 1}`}>
              <FileText className="h-3.5 w-3.5" />
              {busy === url ? "…" : `${fr ? "Document" : "Document"} ${i + 1}`}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">{fr ? "Fichiers privés : un lien sécurisé de 5 minutes est créé à chaque ouverture." : "Private files: a secure 5-minute link is created each time you open one."}</p>
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
