"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { PolicyEditor } from "@/components/admin/policy-editor";
import { SectionError, SectionLoading, EmptyState } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useRole, useServerList } from "@/lib/admin-live";
import { canReviewPolicies } from "@/lib/admin-controls";
import { localDateTime } from "@/lib/dates";
import { socketClient } from "@/lib/realtime/socket-client";
import { POLICY_FIELD_LABEL, compareRows, policyStatusLabel, type PolicyKey, type PolicyRevision, type PolicyStatus } from "@/lib/store-policy";

type Tab = "pending" | "approved" | "rejected" | "all";
const TABS: { id: Tab; en: string; fr: string }[] = [
  { id: "pending", en: "Pending", fr: "En attente" },
  { id: "approved", en: "Approved", fr: "Approuvées" },
  { id: "rejected", en: "Rejected", fr: "Refusées" },
  { id: "all", en: "All", fr: "Toutes" },
];
const STATUS_BADGE: Record<PolicyStatus, "warning" | "success" | "danger"> = { pending: "warning", approved: "success", rejected: "danger" };
const REJECT_MIN = 5;

type StoreRow = { id: string; name: string } & Partial<Record<PolicyKey, string | null>>;

/** The live text of a revision row (`live` comes with every admin list row). */
const liveOf = (rev: PolicyRevision): Record<PolicyKey, string> => ({
  returnsPolicy: rev.live?.returnsPolicy ?? "",
  returnsPolicyFr: rev.live?.returnsPolicyFr ?? "",
  shippingPolicy: rev.live?.shippingPolicy ?? "",
  shippingPolicyFr: rev.live?.shippingPolicyFr ?? "",
});

function PolicyQueue() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const role = useRole();
  const params = useSearchParams();
  const sellerId = params.get("seller") ?? "";
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<PolicyRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [deciding, setDeciding] = useState<{ rev: PolicyRevision; mode: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ sellerId: string; storeName: string; live: Record<PolicyKey, string>; revision: PolicyRevision | null } | null>(null);
  const [pick, setPick] = useState("");
  const allowed = canReviewPolicies(role);
  const stores = useServerList<StoreRow>("sellers:list", { enabled: allowed });

  const connected = rt.status === "connected";
  useEffect(() => {
    if (!connected || !allowed) return;
    let alive = true;
    socketClient
      .request<PolicyRevision[]>("sellers:policy:list", { status: tab, limit: 100, ...(sellerId ? { sellerId } : {}) })
      .then((list) => {
        if (!alive) return;
        setRows(Array.isArray(list) ? list : []);
        setError(null);
      })
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [connected, allowed, tab, sellerId, tick]);

  // A new proposal, or a decision by another admin, re-reads the queue.
  useEffect(() => {
    if (!connected || !allowed) return;
    const sock = socketClient.current;
    if (!sock) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const again = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 300);
    };
    sock.on("policy:pending", again);
    sock.on("policy:decided", again);
    return () => {
      if (timer) clearTimeout(timer);
      sock.off("policy:pending", again);
      sock.off("policy:decided", again);
    };
  }, [connected, allowed]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  function startDecision(rev: PolicyRevision, mode: "approve" | "reject") {
    setDeciding({ rev, mode });
    setNote("");
    setModalError(null);
  }

  async function decide() {
    if (!deciding) return;
    const text = note.trim();
    if (deciding.mode === "reject" && text.length < REJECT_MIN) {
      setModalError(fr ? "Expliquez au vendeur pourquoi la politique n'est pas approuvée (5 caractères minimum)." : "Tell the seller why the policy was not approved (at least 5 characters).");
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      await socketClient.request(deciding.mode === "approve" ? "sellers:policy:approve" : "sellers:policy:reject", { id: deciding.rev.id, ...(text ? { note: text } : {}) });
      toast(deciding.mode === "approve" ? (fr ? "Politique approuvée : elle est en ligne" : "Policy approved: it is live") : fr ? "Politique refusée" : "Policy rejected", "success");
      setDeciding(null);
      reload();
    } catch (e) {
      setModalError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const storeOptions = useMemo(() => [...stores.items].sort((a, b) => a.name.localeCompare(b.name)), [stores.items]);
  const picked = storeOptions.find((s) => s.id === pick);

  if (!allowed) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Action non autorisée." : "Not allowed."}</div>;
  }

  const filterStore = sellerId ? storeOptions.find((s) => s.id === sellerId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Politiques de boutique" : "Store policies"}
        subtitle={fr ? "Chaque modification de politique de retour ou d'expédition attend votre approbation avant d'être en ligne" : "Every change to a returns or shipping policy waits for your approval before it goes live"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Politiques de boutique" : "Store policies" }]}
      />

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-semibold text-slate-900">{fr ? "Modifier la politique d'une boutique" : "Edit any store's policy"}</p>
          <div className="flex flex-wrap items-center gap-3">
            <select className="input-premium min-w-[14rem] px-3 py-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={fr ? "Boutique" : "Store"}>
              <option value="">{fr ? "Choisir une boutique…" : "Choose a store…"}</option>
              {storeOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!picked}
              onClick={() =>
                picked &&
                setEditing({
                  sellerId: picked.id,
                  storeName: picked.name,
                  live: { returnsPolicy: picked.returnsPolicy ?? "", returnsPolicyFr: picked.returnsPolicyFr ?? "", shippingPolicy: picked.shippingPolicy ?? "", shippingPolicyFr: picked.shippingPolicyFr ?? "" },
                  revision: null,
                })
              }
            >
              {fr ? "Modifier et publier" : "Edit and publish"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={fr ? "Statut" : "Status"}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tab === x.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {fr ? x.fr : x.en}
          </button>
        ))}
        {sellerId && (
          <Link href="/admin/policies" className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">
            {filterStore?.name ?? sellerId} ✕
          </Link>
        )}
      </div>

      {error && !rows ? (
        <SectionError message={error} onRetry={reload} />
      ) : !rows ? (
        <SectionLoading className="min-h-[20vh]" />
      ) : rows.length === 0 ? (
        <EmptyState>{tab === "pending" ? (fr ? "Aucune politique en attente." : "No policy is waiting for approval.") : fr ? "Aucune politique." : "No policies here."}</EmptyState>
      ) : (
        <div className="space-y-4" data-testid="policy-queue">
          {rows.map((rev) => {
            const diff = compareRows(rev);
            return (
              <Card key={rev.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-4" data-testid="policy-row">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/admin/sellers/${rev.sellerId}`} className="font-semibold text-[var(--primary)] hover:underline">{rev.storeName ?? rev.sellerId}</Link>
                      <p className="text-xs text-slate-500">
                        {localDateTime(rev.createdAt)}
                        {rev.decidedAt ? ` · ${fr ? "traitée le" : "decided"} ${localDateTime(rev.decidedAt)}` : ""}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[rev.status] ?? "default"}>{policyStatusLabel(rev.status, fr)}</Badge>
                  </div>

                  {diff.length === 0 ? (
                    <p className="text-sm text-slate-500">{fr ? "Aucun texte dans cette modification." : "This change has no text."}</p>
                  ) : (
                    <div className="space-y-3">
                      {diff.map((d) => (
                        <div key={d.key} data-testid={`policy-diff-${d.key}`}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{POLICY_FIELD_LABEL[d.key][fr ? "fr" : "en"]}</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="mb-1 text-[11px] font-medium text-slate-500">{fr ? "En ligne actuellement" : "Live now"}</p>
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{d.live || <span className="text-slate-400">{fr ? "(vide)" : "(empty)"}</span>}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="mb-1 text-[11px] font-medium text-amber-800">{fr ? "Proposé" : "Proposed"}</p>
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{d.cleared ? <span className="text-slate-500">{fr ? "(effacé)" : "(cleared)"}</span> : d.proposed}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {rev.note && rev.status !== "pending" && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-medium">{fr ? "Note : " : "Note: "}</span>{rev.note}</p>
                  )}

                  {rev.status === "pending" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="approve" onClick={() => startDecision(rev, "approve")}>{fr ? "Approuver" : "Approve"}</Button>
                      <Button size="sm" variant="reject" onClick={() => startDecision(rev, "reject")}>{fr ? "Refuser" : "Reject"}</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing({ sellerId: rev.sellerId, storeName: rev.storeName ?? rev.sellerId, live: liveOf(rev), revision: rev })}
                      >
                        {fr ? "Modifier et publier" : "Edit and publish"}
                      </Button>
                    </div>
                  )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding?.mode === "approve" ? (fr ? "Approuver la politique" : "Approve the policy") : fr ? "Refuser la politique" : "Reject the policy"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant={deciding?.mode === "approve" ? "primary" : "danger"} onClick={() => void decide()} disabled={busy}>
              {busy ? "…" : deciding?.mode === "approve" ? (fr ? "Approuver et publier" : "Approve and publish") : fr ? "Refuser" : "Reject"}
            </Button>
          </>
        }
      >
        <p className="text-slate-600">
          {deciding?.mode === "approve"
            ? fr ? "Le texte proposé sera en ligne sur la boutique et le vendeur en sera informé." : "The proposed text goes live on the store and the seller is told."
            : fr ? "Le texte en ligne ne change pas. Le vendeur lira votre note." : "The live text stays as it is. The seller reads your note."}
        </p>
        <label className="block text-xs font-medium text-slate-600">
          {deciding?.mode === "reject" ? (fr ? "Motif du refus (obligatoire)" : "Why it is not approved (required)") : fr ? "Note pour le vendeur (facultatif)" : "Note for the seller (optional)"}
        </label>
        <textarea className="input-premium w-full px-3 py-2 text-sm" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorNote message={modalError} />
      </Modal>

      {editing && (
        <PolicyEditor
          open
          sellerId={editing.sellerId}
          storeName={editing.storeName}
          live={editing.live}
          revision={editing.revision}
          onClose={() => setEditing(null)}
          onDone={() => {
            reload();
            void stores.reload();
          }}
        />
      )}
    </div>
  );
}

export default function AdminPoliciesPage() {
  return (
    <Suspense fallback={<SectionLoading className="min-h-[40vh]" />}>
      <PolicyQueue />
    </Suspense>
  );
}
