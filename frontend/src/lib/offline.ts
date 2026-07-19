/** Offline logging queue: fuel-ups/charges saved with no connection wait in
 * localStorage and sync automatically when the network returns. */

import { useSyncExternalStore } from "react";

import type { ChargePayload, FuelUpPayload } from "../api/types";

const KEY = "pitstop-offline-queue";
const EVENT = "pitstop-queue-changed";

export interface QueuedSave {
  kind: "fuelup" | "charge";
  vehicleId: number;
  payload: FuelUpPayload | ChargePayload;
  queuedAt: string;
}

function read(): QueuedSave[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(queue: QueuedSave[]): void {
  localStorage.setItem(KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(EVENT));
}

export function queueSave(kind: QueuedSave["kind"], vehicleId: number, payload: QueuedSave["payload"]): void {
  write([...read(), { kind, vehicleId, payload, queuedAt: new Date().toISOString() }]);
}

let flushing = false;

/** Try to send everything; items that still fail stay queued. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of read()) {
      const path =
        item.kind === "fuelup"
          ? `/api/vehicles/${item.vehicleId}/fuelups`
          : `/api/vehicles/${item.vehicleId}/charges`;
      try {
        const response = await fetch(path, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (response.ok || response.status === 422) {
          // sent — or permanently unsendable; either way stop retrying it
          write(read().filter((q) => q.queuedAt !== item.queuedAt));
          if (response.ok) sent += 1;
        }
      } catch {
        break; // still offline; try again later
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
};

export function useOfflineQueueCount(): number {
  return useSyncExternalStore(subscribe, () => read().length);
}

// sync whenever connectivity returns, and once on startup
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueue());
  setTimeout(() => void flushQueue(), 2_000);
}
