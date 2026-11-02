"use client";

import { useCallback, useEffect, useState } from "react";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LoadMore } from "@/components/ui/load-more";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { useRealtime } from "@/context/realtime-context";
import { formatCurrency } from "@/lib/utils";
import { localDateTime } from "@/lib/dates";
import { walletSigned, walletTypeLabel } from "@/lib/wallet-tx";

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  balance: number;
  description: string;
  descriptionFr: string;
  createdAt: string;
}
interface CustomerWallet {
  balance: number;
  transactions: WalletTx[];
}

const PAGE = 20;

/** Read-only: a customer's wallet balance and recent transactions. Nothing here changes money. */
export function CustomerWalletPanel({ customerId, fr, locale }: { customerId: string; fr: boolean; locale: string }) {
  const connected = useRealtime().status === "connected";
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [rows, setRows] = useState<WalletTx[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const w = await socketClient.request<CustomerWallet>("customers:wallet", { id: customerId, limit: PAGE, offset: 0 });
      setWallet(w);
      setRows(w.transactions);
      setHasMore(w.transactions.length === PAGE);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [connected, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const w = await socketClient.request<CustomerWallet>("customers:wallet", { id: customerId, limit: PAGE, offset: rows.length });
    setRows((cur) => [...cur, ...w.transactions.filter((t) => !cur.some((x) => x.id === t.id))]);
    setHasMore(w.transactions.length === PAGE);
  }, [customerId, rows.length]);

  return (
    <DetailSection title={fr ? "Portefeuille" : "Wallet"}>
      {error && <SectionError message={error} onRetry={() => void load()} />}
      {loading && !error && <SectionLoading />}
      {wallet && !error && (
        <div className="space-y-4">
          <InfoGrid items={[{ label: fr ? "Solde" : "Balance", value: formatCurrency(wallet.balance, locale) }]} />
          <p className="text-xs text-slate-500">
            {fr ? "Lecture seule : le solde ne se modifie pas ici." : "Read only: the balance cannot be changed here."}
          </p>
          <DataTable
            columns={[
              { key: "createdAt", label: fr ? "Date" : "Date", render: (r) => localDateTime(String(r.createdAt)) },
              { key: "type", label: fr ? "Type" : "Type", render: (r) => <Badge>{walletTypeLabel(String(r.type), fr)}</Badge> },
              { key: "description", label: fr ? "Description" : "Description", render: (r) => (fr ? String(r.descriptionFr || r.description) : String(r.description)) },
              {
                key: "amount",
                label: fr ? "Montant" : "Amount",
                render: (r) => {
                  const v = walletSigned(String(r.type), Number(r.amount));
                  return <span className={v < 0 ? "text-red-600" : "text-emerald-700"}>{v < 0 ? "−" : "+"}{formatCurrency(Math.abs(v), locale)}</span>;
                },
              },
              { key: "balance", label: fr ? "Solde après" : "Balance after", render: (r) => formatCurrency(Number(r.balance), locale) },
            ]}
            data={rows as unknown as Record<string, unknown>[]}
            emptyMessage={fr ? "Aucune transaction" : "No transactions yet"}
          />
          {rows.length > 0 && <LoadMore hasMore={hasMore} onLoad={loadMore} loaded={rows.length} noun={{ en: "transactions", fr: "transactions" }} />}
        </div>
      )}
    </DetailSection>
  );
}
