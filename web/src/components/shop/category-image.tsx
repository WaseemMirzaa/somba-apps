"use client";

/* eslint-disable @next/next/no-img-element -- category pictures are admin-entered URLs of any host, which next/image refuses unless configured */
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The picture of a category tile. A category may have no image at all (`image` empty) or one that cannot be loaded
 * (dead link, offline): either way the tile shows a neutral placeholder instead of the browser's broken-image mark,
 * with the category's icon in the middle unless `placeholder="plain"` (the tile already shows the icon elsewhere).
 *
 * The parent sizes it (it fills the box) and is expected to be `relative overflow-hidden`.
 */
export function CategoryImage({
  src,
  alt,
  icon,
  placeholder = "icon",
  className,
}: {
  src: string | null | undefined;
  alt: string;
  icon?: string | null;
  placeholder?: "icon" | "plain";
  /** Extra classes of the picture itself (e.g. the hover zoom). */
  className?: string;
}) {
  // Remember WHICH url failed, so a category whose image is replaced by a working one is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = (src ?? "").trim();

  if (!url || failedSrc === url) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn("absolute inset-0 flex items-start justify-center bg-gradient-to-br from-slate-500 to-slate-800 pt-4", className)}
      >
        {placeholder === "icon" && (
          <span aria-hidden className="text-4xl leading-none opacity-90">
            {icon?.trim() || "🛍️"}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(url)}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}
