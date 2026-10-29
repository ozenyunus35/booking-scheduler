"use client";

import { useSyncExternalStore } from "react";

/** Current time, refreshed every 30 seconds, so waiting times tick without a reload. */
let now = 0;
const subscribe = (cb: () => void) => {
  const t = window.setInterval(() => {
    now = Date.now();
    cb();
  }, 30_000);
  return () => window.clearInterval(t);
};
const read = () => (now ||= Date.now());

export const useNow = () => useSyncExternalStore(subscribe, read, () => 0);
