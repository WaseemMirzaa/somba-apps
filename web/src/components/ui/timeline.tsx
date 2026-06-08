import { cn } from "@/lib/utils";

export function ActivityTimeline({
  events,
}: {
  events: { time: string; label: string; detail?: string; done?: boolean }[];
}) {
  return (
    <ol className="relative space-y-0">
      {events.map((event, i) => (
        <li key={i} className="flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-3 w-3 rounded-full ring-4 ring-white",
                event.done !== false ? "bg-blue-600" : "bg-slate-200"
              )}
            />
            {i < events.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-blue-100" style={{ minHeight: 24 }} />
            )}
          </div>
          <div className="flex-1 pt-0">
            <p className="text-sm font-medium text-slate-900">{event.label}</p>
            {event.detail && (
              <p className="text-xs text-slate-500">{event.detail}</p>
            )}
            <p className="text-xs text-slate-400">{event.time}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
