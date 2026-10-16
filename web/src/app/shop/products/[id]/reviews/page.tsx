"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Star, ThumbsUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useProduct } from "@/lib/catalog";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Review } from "@/lib/realtime/types";
import { cn } from "@/lib/utils";

type LiveReview = Review & { helpful?: number };

export default function ProductReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const product = useProduct(id);
  const [reviews, setReviews] = useState<LiveReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [saving, setSaving] = useState(false);
  const [voted, setVoted] = useState<string[]>([]);

  useEffect(() => {
    if (!id || rt.status !== "connected") return;
    let alive = true;
    socketClient
      .request<LiveReview[]>("reviews:list", { productId: id })
      .then((list) => alive && setReviews(list))
      .catch(() => alive && setReviews([]))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [id, rt.status]);

  if (!product) {
    const loading = rt.status !== "connected" || !loaded;
    return <div className="text-center text-slate-500">{loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Produit introuvable" : "Product not found"}</div>;
  }

  function openForm() {
    if (!rt.user) {
      toast(fr ? "Connectez-vous pour écrire un avis" : "Sign in to write a review", "info");
      router.push(`/shop/login?next=${encodeURIComponent(`/shop/products/${id}/reviews`)}`);
      return;
    }
    setShowForm(true);
  }

  async function submit() {
    if (!rating || reviewText.trim().length < 3) {
      toast(fr ? "Veuillez ajouter une note et un avis" : "Please add a rating and review", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await socketClient.request<LiveReview>("reviews:create", { productId: id, rating, text: reviewText.trim() });
      setReviews((cur) => [created, ...cur.filter((r) => r.id !== created.id)]);
      setShowForm(false);
      setRating(0);
      setReviewText("");
      toast(fr ? "Avis publié — merci !" : "Review published — thank you!");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function helpful(reviewId: string) {
    if (!rt.user) {
      toast(fr ? "Connectez-vous pour voter" : "Sign in to vote", "info");
      return;
    }
    try {
      await rt.markReviewHelpful(reviewId);
      setVoted((v) => [...v, reviewId]);
      setReviews((cur) => cur.map((r) => (r.id === reviewId ? { ...r, helpful: (r.helpful ?? 0) + 1 } : r)));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const name = fr ? product.nameFr : product.name;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={fr ? `Avis — ${name}` : `Reviews — ${name}`}
        subtitle={fr ? `${product.rating} ★ · ${reviews.length} avis` : `${product.rating} ★ · ${reviews.length} reviews`}
        backHref={`/shop/products/${id}`}
        actions={<Button size="sm" onClick={openForm}>{fr ? "Écrire un avis" : "Write Review"}</Button>}
      />

      {showForm && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{fr ? "Écrire un avis" : "Write a Review"}</h3>
          <p className="text-xs text-slate-500">
            {fr ? "Vous pouvez donner votre avis après avoir reçu le produit." : "You can review a product after it has been delivered to you."}
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)} aria-label={`${s}`}>
                <Star className={cn("h-6 w-6 cursor-pointer", s <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
              </button>
            ))}
          </div>
          <textarea className="input-premium w-full px-4 py-3 text-sm" rows={4} placeholder={fr ? "Partagez votre expérience..." : "Share your experience..."} value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving}>{saving ? "…" : fr ? "Soumettre l'avis" : "Submit Review"}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}

      {loaded && reviews.length === 0 && (
        <div className="card-premium p-8 text-center text-sm text-slate-500">
          {fr ? "Aucun avis pour le moment. Soyez le premier !" : "No reviews yet. Be the first!"}
          <div className="mt-3">
            <Link href={`/shop/products/${id}`} className="text-[var(--primary)] hover:underline">
              {fr ? "← Retour au produit" : "← Back to product"}
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="card-premium p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                {r.author[0]}
              </div>
              <div>
                <p className="font-semibold">{r.author}</p>
                <p className="text-sm text-amber-500">{"★".repeat(r.rating)}</p>
              </div>
              <span className="ml-auto text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-3 text-sm text-slate-700">{r.text}</p>
            <button
              onClick={() => helpful(r.id)}
              disabled={voted.includes(r.id)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[var(--primary)] disabled:opacity-60"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {fr ? "Utile" : "Helpful"} ({r.helpful ?? 0})
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
