"use client";

import { useSyncExternalStore } from "react";
import { zonedNow } from "./dates";
import { createSeed, STATE_VERSION, TIME_ZONE } from "./seed";
import type { DemoState } from "./types";

/**
 * Browser-side persistence for the demo. State is one JSON document in
 * localStorage, shared across tabs through the `storage` event, so a booking made
 * on the public page shows up in the salon calendar open in another tab.
 * The demo re-seeds on a new salon day, so the calendar always sits around today.
 */

const STATE_KEY = "cadence:state";

let snap: DemoState | null = null;
const listeners = new Set<() => void>();

function read(): DemoState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === STATE_VERSION && parsed.seededOn === zonedNow(TIME_ZONE).date) return parsed;
    }
  } catch {
    // Corrupt or blocked storage: fall through to a fresh seed.
  }
  const fresh = createSeed();
  persist(fresh);
  return fresh;
}

function persist(state: DemoState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the demo keeps working in memory.
  }
}

const emit = () => listeners.forEach((l) => l());

export function getState(): DemoState {
  if (!snap) snap = read();
  return snap;
}

/** Applies a change to a copy of the state, saves it and notifies subscribers. */
export function update(fn: (draft: DemoState) => void) {
  const next = structuredClone(getState());
  fn(next);
  snap = next;
  persist(next);
  emit();
}

export function resetDemo() {
  snap = createSeed();
  persist(snap);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STATE_KEY || e.key === null) {
      snap = read();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The demo state, or null while rendering on the server (static export). */
export function useStore(): DemoState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}
