// React hooks over the store. useSyncExternalStore re-renders a component
// whenever the store changes; useMemo recomputes the "base + pending ops"
// view only when the base or the outbox actually changed.
import { useMemo, useSyncExternalStore } from "react";
import { applyToList, applyToTrip } from "./ops.js";
import { getState, subscribe } from "./store.js";

export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

// The trip list, or null while there's nothing to show yet.
export function useTripList() {
  const { baseList, outbox } = useStore();
  return useMemo(() => {
    if (baseList === null && !outbox.some((o) => o.type === "createTrip")) return null;
    return outbox.reduce(applyToList, baseList ?? []);
  }, [baseList, outbox]);
}

// One trip with its days and stops.
// Returns undefined = not loaded yet, null = doesn't exist (or deleted).
export function useTrip(tripId) {
  const { baseTrips, outbox } = useStore();
  const base = baseTrips[tripId];
  return useMemo(() => {
    const ops = outbox.filter((o) => o.tripId === tripId);
    if (base === undefined && !ops.some((o) => o.type === "createTrip")) return undefined;
    return ops.reduce(applyToTrip, base ?? null);
  }, [base, outbox, tripId]);
}

export function useSyncStatus() {
  const { online, syncing, outbox, rejected } = useStore();
  return { online, syncing, pending: outbox.length, rejected };
}
