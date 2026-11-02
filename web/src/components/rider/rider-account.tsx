"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailSection } from "@/components/ui/info-grid";
import { ChangePasswordForm } from "@/components/seller/account-security";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { BackendUser } from "@/lib/realtime/types";
import { hasProblems, profilePatch, profileProblems, type ProfileProblems } from "@/lib/rider-profile";
import { errMessage } from "@/lib/seller-labels";

const fieldClass = "input-premium w-full px-4 py-2 text-sm";

/**
 * The rider edits their own name and phone (`me:update`). The e-mail is shown, not editable: only the fleet team or an admin
 * changes it. The server edits the signed-in account only.
 */
function RiderProfileEdit({ name, phone, email, editing, setEditing, onSaved }: { name: string; phone: string | null; email: string; editing: boolean; setEditing: (v: boolean) => void; onSaved: (u: Pick<BackendUser, "name" | "phone">) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone ?? "");
  const [problems, setProblems] = useState<ProfileProblems | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const found = profileProblems(n, p, fr);
    setProblems(found);
    if (hasProblems(found)) return;
    setBusy(true);
    try {
      const saved = await socketClient.request<BackendUser>("me:update", profilePatch(n, p));
      onSaved({ name: saved.name, phone: saved.phone ?? null });
      setEditing(false);
      toast(fr ? "Profil mis à jour" : "Profile updated");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setN(name);
          setP(phone ?? "");
          setProblems(null);
          setEditing(true);
        }}
      >
        {fr ? "Modifier mon profil" : "Edit my profile"}
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Nom complet" : "Full name"}</label>
        <input className={fieldClass} value={n} onChange={(e) => setN(e.target.value)} autoComplete="name" aria-invalid={!!problems?.name} />
        {problems?.name && <p role="alert" className="mt-1 text-xs text-red-600">{problems.name}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Numéro de téléphone" : "Phone number"}</label>
        <input className={fieldClass} type="tel" value={p} onChange={(e) => setP(e.target.value)} placeholder="+243 81 234 5678" autoComplete="tel" aria-invalid={!!problems?.phone} />
        {problems?.phone && <p role="alert" className="mt-1 text-xs text-red-600">{problems.phone}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "E-mail" : "E-mail"}</label>
        <input className={`${fieldClass} bg-slate-50 text-slate-500`} value={email} readOnly disabled />
        <p className="mt-1 text-xs text-slate-500">{fr ? "Votre e-mail ne peut être modifié que par l'équipe flotte." : "Your e-mail can only be changed by the fleet team."}</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
      </div>
    </form>
  );
}

/**
 * Edit profile and Change password, one open at a time (so the page never shows two primary buttons at once). The password
 * form changes it with `me:changePassword`: other devices are signed out, this one keeps working.
 */
export function RiderAccountPanels({ name, phone, email, onSaved }: { name: string; phone: string | null; email: string; onSaved: (u: Pick<BackendUser, "name" | "phone">) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [panel, setPanel] = useState<"profile" | "password" | null>(null);
  return (
    <DetailSection title={fr ? "Mon compte" : "My account"}>
      <div className="space-y-4">
        <RiderProfileEdit name={name} phone={phone} email={email} editing={panel === "profile"} setEditing={(v) => setPanel(v ? "profile" : null)} onSaved={onSaved} />
        {panel === "password" ? (
          <div className="space-y-3">
            <ChangePasswordForm />
            <p className="text-xs text-slate-500">
              {fr ? "Vous restez connecté sur cet appareil ; les autres appareils sont déconnectés." : "You stay signed in on this device; any other device is signed out."}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(null)}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setPanel("password")}>
            {fr ? "Changer le mot de passe" : "Change password"}
          </Button>
        )}
      </div>
    </DetailSection>
  );
}
