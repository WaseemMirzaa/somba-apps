"use client";

import { useState } from "react";
import { Copy, Mail, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { Countdown } from "@/components/seller/countdown";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest, useLiveQuery } from "@/lib/seller-api";
import { TEAM_ROLES, TEAM_ROLE_LABEL, type TeamRole } from "@/lib/seller-access";
import { copyText, inviteLink, type TeamData, type TeamMember } from "@/lib/seller-account";
import { errMessage } from "@/lib/seller-labels";

const fieldClass = "input-premium w-full px-4 py-2 text-sm";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Team management (owner): invite people by e-mail, give them a role, change it, remove them. Live with `team:updated`. */
export default function SellerTeamPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const team = useLiveQuery<TeamData>("team:list", {}, { pushes: ["team:updated"] });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Outside production the server returns the invitation token with the invite: show a copyable link (no mailbox needed).
  const [devLinks, setDevLinks] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  const data = team.data;
  const emailOk = EMAIL.test(email.trim());
  const full = !!data && data.seats.max !== null && data.seats.used >= data.seats.max;

  async function invite(to: string, as: Exclude<TeamRole, "owner">, who?: string) {
    setBusy(`invite:${to}`);
    setError(null);
    try {
      const r = await sellerRequest<{ member: TeamMember; sent: boolean; devToken?: string }>("team:invite", {
        email: to.trim(),
        role: as,
        ...(who?.trim() ? { name: who.trim() } : {}),
      });
      if (r.devToken) setDevLinks((d) => ({ ...d, [r.member.email.toLowerCase()]: inviteLink(r.devToken as string) }));
      toast(
        r.sent
          ? fr ? `Invitation envoyée à ${to.trim()}` : `Invitation sent to ${to.trim()}`
          : fr ? "Invitation enregistrée" : "Invitation saved",
      );
      setEmail("");
      setName("");
      await team.reload();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  async function setMemberRole(m: TeamMember, next: TeamRole) {
    setBusy(`role:${m.id}`);
    try {
      await sellerRequest("team:setRole", { memberId: m.id, role: next });
      toast(fr ? "Rôle modifié" : "Role changed");
      await team.reload();
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: TeamMember) {
    setBusy(`remove:${m.id}`);
    try {
      await sellerRequest("team:remove", { memberId: m.id });
      toast(m.status === "invited" ? (fr ? "Invitation annulée" : "Invitation cancelled") : fr ? "Membre retiré de l'équipe" : "Member removed from the team");
      setRemoving(null);
      await team.reload();
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Équipe" : "Team"}
        subtitle={fr ? "Invitez des collaborateurs et donnez-leur l'accès qu'il faut, pas plus" : "Invite people to work in your store, with the access they need and no more"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: fr ? "Équipe" : "Team" }]}
        actions={
          data ? (
            <Badge variant={full ? "warning" : "info"}>
              {data.seats.max === null
                ? fr ? `${data.seats.used} membre(s) · sans limite` : `${data.seats.used} member(s) · unlimited seats`
                : fr ? `${data.seats.used} / ${data.seats.max} places` : `${data.seats.used} / ${data.seats.max} seats`}
            </Badge>
          ) : undefined
        }
      />
      {team.error && <LoadError message={team.error} onRetry={team.reload} />}

      <div className="card-premium p-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <UserPlus className="h-4 w-4" />
          {fr ? "Inviter un collaborateur" : "Invite a team member"}
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {fr
            ? "La personne reçoit un e-mail avec un lien valable plusieurs jours. Elle ouvre un compte vendeur avec cette adresse, ou se connecte, puis accepte."
            : "They get an e-mail with a link that stays valid for a few days. They open a seller account with that address, or sign in, then accept."}
        </p>
        <form
          className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailOk && !full) void invite(email, role, name);
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "E-mail" : "E-mail"}</label>
            <input type="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" aria-label={fr ? "E-mail du collaborateur" : "Team member e-mail"} />
            {email !== "" && !emailOk && <p className="mt-1 text-xs text-red-600">{fr ? "Saisissez une adresse e-mail valide." : "Enter a valid e-mail address."}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Nom (facultatif)" : "Name (optional)"}</label>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{fr ? "Rôle" : "Role"}</label>
            <select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as Exclude<TeamRole, "owner">)} aria-label={fr ? "Rôle" : "Role"}>
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>{fr ? TEAM_ROLE_LABEL[r].fr : TEAM_ROLE_LABEL[r].en}</option>
              ))}
            </select>
          </div>
          <div className="self-end">
            <Button type="submit" disabled={!emailOk || full || busy !== null}>
              <Mail className="h-4 w-4" />
              {busy?.startsWith("invite:") ? (fr ? "Envoi…" : "Sending…") : fr ? "Inviter" : "Invite"}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">{fr ? TEAM_ROLE_LABEL[role].descFr : TEAM_ROLE_LABEL[role].descEn}</p>
        {full && (
          <p className="mt-2 text-sm text-amber-700">
            {fr ? "Toutes les places de votre offre sont prises : retirez un membre ou passez à une offre supérieure." : "Every seat of your plan is taken: remove a member or upgrade your plan."}
          </p>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <div className="card-premium overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">{fr ? "Membres et invitations" : "Members and invitations"}</h2>
        </div>
        {team.loading ? (
          <SectionLoader />
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="team-list">
            {(data?.members ?? []).map((m) => {
              const owner = m.role === "owner" || m.isOwner;
              const link = devLinks[m.email.toLowerCase()];
              return (
                <li key={m.id} className="space-y-2 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{m.name || m.email}</p>
                      <p className="truncate text-xs text-slate-500">{m.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.status === "invited" ? (
                        <>
                          <Badge variant="warning">{fr ? "Invité" : "Invited"}</Badge>
                          {m.inviteExpiresAt && <Countdown until={m.inviteExpiresAt} />}
                        </>
                      ) : (
                        <Badge variant="success">{fr ? "Actif" : "Active"}</Badge>
                      )}
                      {owner ? (
                        <Badge variant="purple">{fr ? TEAM_ROLE_LABEL.owner.fr : TEAM_ROLE_LABEL.owner.en}</Badge>
                      ) : (
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium"
                          value={m.role}
                          disabled={busy !== null}
                          onChange={(e) => void setMemberRole(m, e.target.value as TeamRole)}
                          aria-label={fr ? `Rôle de ${m.email}` : `Role of ${m.email}`}
                        >
                          {TEAM_ROLES.map((r) => (
                            <option key={r} value={r}>{fr ? TEAM_ROLE_LABEL[r].fr : TEAM_ROLE_LABEL[r].en}</option>
                          ))}
                        </select>
                      )}
                      {!owner && m.status === "invited" && (
                        <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void invite(m.email, m.role as Exclude<TeamRole, "owner">, m.name ?? undefined)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          {fr ? "Renvoyer" : "Resend"}
                        </Button>
                      )}
                      {!owner &&
                        (removing === m.id ? (
                          <>
                            <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => void remove(m)}>
                              {m.status === "invited" ? (fr ? "Annuler l'invitation" : "Cancel invitation") : fr ? "Confirmer le retrait" : "Confirm removal"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>{fr ? "Non" : "No"}</Button>
                          </>
                        ) : (
                          <Button variant="reject" size="sm" disabled={busy !== null} onClick={() => setRemoving(m.id)} aria-label={fr ? `Retirer ${m.email}` : `Remove ${m.email}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                            {fr ? "Retirer" : "Remove"}
                          </Button>
                        ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{fr ? TEAM_ROLE_LABEL[m.role].descFr : TEAM_ROLE_LABEL[m.role].descEn}</p>
                  {link && m.status === "invited" && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900" data-testid="dev-invite-link">
                      <span className="font-semibold">{fr ? "Lien d'invitation (environnement de test)" : "Invitation link (test environment)"}</span>
                      <code className="min-w-0 flex-1 break-all">{link}</code>
                      <Button variant="secondary" size="sm" onClick={async () => toast((await copyText(link)) ? (fr ? "Lien copié" : "Link copied") : fr ? "Copie impossible" : "Could not copy", "info")}>
                        <Copy className="h-3.5 w-3.5" />
                        {fr ? "Copier" : "Copy"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card-premium p-6">
        <h2 className="mb-3 font-semibold">{fr ? "Ce que chaque rôle peut faire" : "What each role can do"}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {TEAM_ROLES.map((r) => (
            <div key={r} className="rounded-xl border border-slate-100 p-3">
              <dt className="text-sm font-semibold text-slate-900">{fr ? TEAM_ROLE_LABEL[r].fr : TEAM_ROLE_LABEL[r].en}</dt>
              <dd className="text-xs text-slate-500">{fr ? TEAM_ROLE_LABEL[r].descFr : TEAM_ROLE_LABEL[r].descEn}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
