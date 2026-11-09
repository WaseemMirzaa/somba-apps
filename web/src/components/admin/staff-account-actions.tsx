"use client";

import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SecretBox } from "@/components/admin/copy-box";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg, type StaffRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { staffActionText } from "@/lib/staff-account";

/**
 * "Reset password" and "Edit e-mail" for one staff account (super admin only: the server refuses anyone else).
 * Reset issues a NEW temporary password on the server, shown here once with a copy button; the person is signed out
 * everywhere and must replace it at the next sign-in. Edit e-mail corrects the address (unique, never your own).
 */
export function StaffAccountActions({ person, selfId, onEmailChanged }: { person: StaffRow; selfId?: string; onEmailChanged: (id: string, email: string) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const text = staffActionText(fr);
  const self = person.id === selfId;

  const [resetting, setResetting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(person.email);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function reset() {
    setResetBusy(true);
    setResetError(null);
    try {
      const res = await socketClient.request<{ tempPassword: string }>("roles:resetPassword", { userId: person.id });
      setIssued(res.tempPassword);
      toast(text.resetDone(person.name), "success");
    } catch (e) {
      const msg = errMsg(e);
      setResetError(msg);
      toast(msg, "error");
    } finally {
      setResetBusy(false);
    }
  }

  async function saveEmail() {
    const next = email.trim();
    if (!next) {
      setEditError(text.emailRequired);
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await socketClient.request<{ email: string }>("roles:updateStaff", { userId: person.id, email: next });
      onEmailChanged(person.id, res.email);
      toast(text.emailDone(person.name), "success");
      setEditing(false);
    } catch (e) {
      const msg = errMsg(e);
      setEditError(msg);
      toast(msg, "error");
    } finally {
      setEditBusy(false);
    }
  }

  const closeReset = () => {
    if (resetBusy) return;
    setResetting(false);
    setIssued(null); // the password is not kept anywhere once the box is closed
  };

  return (
    <>
      {person.mustChangePassword && <Badge variant="warning">{text.pendingBadge}</Badge>}
      {!self && (
        <>
          <Button size="sm" variant="secondary" onClick={() => { setResetError(null); setIssued(null); setResetting(true); }}>
            <KeyRound className="h-3.5 w-3.5" />
            {text.resetButton}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setEmail(person.email); setEditError(null); setEditing(true); }}>
            <Mail className="h-3.5 w-3.5" />
            {text.emailButton}
          </Button>
        </>
      )}

      <Modal
        open={resetting}
        onClose={closeReset}
        title={issued ? text.issuedTitle : text.resetTitle}
        footer={
          issued ? undefined : (
            <>
              <Button variant="secondary" size="sm" onClick={closeReset} disabled={resetBusy}>{fr ? "Annuler" : "Cancel"}</Button>
              <Button variant="danger" size="sm" onClick={() => void reset()} disabled={resetBusy}>{resetBusy ? "…" : text.resetConfirm}</Button>
            </>
          )
        }
      >
        {issued ? (
          <SecretBox email={person.email} secret={issued} fr={fr} onDismiss={closeReset} headline={text.issuedHeadline(person.name, person.email)} note={text.issuedNote} />
        ) : (
          <>
            <p><strong>{person.name}</strong> · {person.email}</p>
            <p className="text-slate-500">{text.resetBody}</p>
            <ErrorNote message={resetError} />
          </>
        )}
      </Modal>

      <Modal
        open={editing}
        onClose={() => !editBusy && setEditing(false)}
        title={text.emailTitle}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={editBusy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" onClick={() => void saveEmail()} disabled={editBusy}>{editBusy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
          </>
        }
      >
        <p><strong>{person.name}</strong></p>
        <form onSubmit={(e) => { e.preventDefault(); void saveEmail(); }}>
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`staff-email-${person.id}`}>{text.emailLabel}</label>
          <input id={`staff-email-${person.id}`} type="email" className="input-premium w-full px-4 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </form>
        <p className="text-slate-500">{text.emailBody}</p>
        <ErrorNote message={editError} />
      </Modal>
    </>
  );
}
