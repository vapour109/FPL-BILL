"use client";
import { useCallback, useSyncExternalStore } from "react";

// Gate for the admin tab. This is a convenience lock, not security: the code
// ships in the client bundle and the database policies are open, so anyone
// determined can bypass it. It exists to stop the league casually editing
// names, rates and scores — not to withstand an attacker.
export const ADMIN_CODE = "luke8";

const UNLOCK_KEY = "thebill_admin_unlocked";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUnlocked(on: boolean) {
  try {
    if (on) sessionStorage.setItem(UNLOCK_KEY, "1");
    else sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Session storage unavailable — the tab just re-asks for the code.
  }
  for (const l of listeners) l();
}

// sessionStorage is an external store, so subscribe to it rather than mirroring
// it into state from an effect. Unlocking lasts for the browser tab's session.
export function useAdminUnlocked(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  // No sessionStorage during the server render, so it starts locked and
  // settles on the real value at hydration.
  return useSyncExternalStore(subscribe, read, () => false);
}
