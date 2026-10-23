/* eslint-disable @next/next/no-img-element -- uploaded images live on the API host (see ProductImage) */

/**
 * Store banner with the logo overlapping its bottom edge. Without a banner it shows a brand gradient; without a
 * logo, the store's initial — so a store with no branding still looks finished.
 */
export function StoreHeader({ name, logoUrl, bannerUrl }: { name: string; logoUrl?: string | null; bannerUrl?: string | null }) {
  // The logo is positioned against the banner box only; the spacer below makes room for the part that hangs out.
  return (
    <div>
      <div className="relative">
        <div className="h-32 w-full overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 sm:h-44">
          {bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="absolute -bottom-8 left-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-blue-100 text-2xl font-bold text-blue-700 shadow">
          {logoUrl ? <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-cover" /> : (name[0] ?? "?").toUpperCase()}
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
