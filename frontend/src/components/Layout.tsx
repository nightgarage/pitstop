import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CloudOff, Fuel, Warehouse, Wrench } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { flushQueue, useOfflineQueueCount } from "../lib/offline";

const NAV_ITEMS = [
  { to: "/", label: "Garage", icon: Warehouse, end: true },
  { to: "/log", label: "Log", icon: Fuel, end: false },
  { to: "/service", label: "Service", icon: Wrench, end: false },
  { to: "/stats", label: "Stats", icon: BarChart3, end: false },
];

export default function Layout({ children }: { children: ReactNode }) {
  const queued = useOfflineQueueCount();
  const queryClient = useQueryClient();

  // when queued entries drain, refresh whatever's on screen
  useEffect(() => {
    if (queued === 0) queryClient.invalidateQueries();
  }, [queued, queryClient]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {queued > 0 && (
        <button
          onClick={() => void flushQueue()}
          className="flex items-center justify-center gap-2 bg-warn/15 px-4 py-2.5 text-[13px] font-semibold text-warn"
        >
          <CloudOff size={15} strokeWidth={2} />
          {queued} {queued === 1 ? "entry" : "entries"} saved offline — will sync automatically
        </button>
      )}
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/90 backdrop-blur
                   pb-[max(env(safe-area-inset-bottom),8px)]"
      >
        <div className="mx-auto flex max-w-lg justify-around pt-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
                  isActive ? "text-accent" : "text-muted hover:text-text"
                }`
              }
            >
              <Icon size={20} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
