// Demo setting: "Show English" adds small English under the Spanish, so judges and teammates who
// don't read Spanish can follow the app. Kept on this device only (remembered on web), not on the
// patient record, because it is a presentation aid rather than a patient preference.
import { useSyncExternalStore } from 'react';

import { withEnglish } from './i18n';

const KEY = 'interlude.showEnglish';
const listeners = new Set<() => void>();

function load(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let value = load();

export function setShowEnglish(next: boolean) {
  value = next;
  try {
    globalThis.localStorage?.setItem(KEY, next ? '1' : '0');
  } catch {
    // Not available on native or in a private window; the switch still works until reload.
  }
  listeners.forEach((listener) => listener());
}

export function useShowEnglish(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => value,
    () => false, // server render (web): off until the browser loads the saved setting
  );
}

/**
 * Spanish data with its stored English attached when "Show English" is on. Reads the current
 * value without subscribing: every screen already re-renders on a toggle, since usePatient()
 * (which subscribes) hands out a new strings object.
 */
export function bi(main: string, english: string | null | undefined, language: 'en' | 'es'): string {
  return withEnglish(main, english, value && language === 'es');
}
