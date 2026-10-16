/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * Product / upload thumbnail. A plain <img> on purpose: uploaded photos live on
 * the API host, which next/image would reject unless it is whitelisted.
 */
export function ProductImage({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  return <img src={src} alt={alt} loading="lazy" className={cn("h-full w-full object-cover", className)} />;
}
