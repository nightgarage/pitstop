/** Home-screen install helpers for the welcome walkthrough.
 *
 * Imported for its side effect from main.tsx: Chromium fires
 * `beforeinstallprompt` once, early — if nobody is listening when it fires,
 * the install button can never work. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
  });
}

/** Already running as an installed app (home screen / desktop install)? */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad — where install is the non-obvious Share → Add to Home Screen. */
export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but Macs don't have touch screens
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Android phone/tablet — install lives in the browser's ⋮ menu when the
 * one-tap prompt isn't available (Firefox, Samsung Internet, ...). */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Chromium captured an install prompt we can trigger on demand. */
export function canPromptInstall(): boolean {
  return deferredPrompt != null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null; // single-use
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}
