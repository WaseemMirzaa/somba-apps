import { MapPin } from "lucide-react";

export function MockLiveMap({ rider, eta, label }: { rider: string; eta?: string; label?: string }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-sky-50">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <MapPin className="mx-auto h-12 w-12 text-blue-600" />
          <p className="mt-2 text-sm font-medium">{label ?? "Live map (mock)"}</p>
          {eta && <p className="text-xs text-slate-500">{rider} · ETA {eta}</p>}
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/90 p-3 text-sm shadow">
        <p className="font-medium">{rider}</p>
      </div>
    </div>
  );
}
