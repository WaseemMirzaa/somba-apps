"use client";

import { useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { getProductDetail } from "@/lib/entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";

export default function ProductReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const product = getProductDetail(Number(id));
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [extraReviews, setExtraReviews] = useState<{ author: string; rating: number; text: string; date: string }[]>([]);

  if (!product) return <div className="text-center text-slate-500">{fr ? "Produit introuvable" : "Product not found"}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={fr ? `Avis — ${product.nameFr}` : `Reviews — ${product.name}`}
        subtitle={fr ? `${product.rating} ★ · ${product.reviews.toLocaleString()} avis` : `${product.rating} ★ · ${product.reviews.toLocaleString()} reviews`}
        backHref={`/shop/products/${id}`}
        actions={<Button size="sm" onClick={() => setShowForm(true)}>{fr ? "Écrire un avis" : "Write Review"}</Button>}
      />

      {showForm && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">{fr ? "Écrire un avis" : "Write a Review"}</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)}>
                <Star className={cn("h-6 w-6 cursor-pointer", s <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
              </button>
            ))}
          </div>
          <textarea className="input-premium w-full px-4 py-3 text-sm" rows={4} placeholder={fr ? "Partagez votre expérience..." : "Share your experience..."} value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center text-sm text-slate-500">
            {fr ? "Téléverser des photos (démo) — glisser-déposer ou cliquer" : "Upload photos (mock) — drag & drop or click"}
          </div>
          <Button
            onClick={() => {
              if (!rating || !reviewText.trim()) { toast(fr ? "Veuillez ajouter une note et un avis" : "Please add a rating and review", "error"); return; }
              setExtraReviews((r) => [...r, { author: fr ? "Vous" : "You", rating, text: reviewText, date: fr ? "À l'instant" : "Just now" }]);
              setShowForm(false);
              setRating(0);
              setReviewText("");
              toast(fr ? "Avis soumis — merci !" : "Review submitted — thank you!");
            }}
          >
            {fr ? "Soumettre l'avis" : "Submit Review"}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {[...extraReviews, ...product.reviews_list].map((r, i) => (
          <div key={i} className="card-premium p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                {r.author[0]}
              </div>
              <div>
                <p className="font-semibold">{r.author}</p>
                <p className="text-amber-500 text-sm">{"★".repeat(r.rating)}</p>
              </div>
              <span className="ml-auto text-xs text-slate-400">{r.date}</span>
            </div>
            <p className="mt-3 text-sm text-slate-700">{r.text}</p>
            {i === 0 && extraReviews.length === 0 && (
              <div className="mt-3 flex gap-2">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Image src={product.image} alt="review" fill className="object-cover" sizes="64px" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
