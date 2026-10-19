import { useCallback, useEffect, useState } from "react";

export interface InstallPromptEvent {
  prompt: () => Promise<void>;
}

/** `beforeinstallprompt` only fires on Chromium; iOS Safari never fires it,
 *  so callers fall back to the manual-instructions sheet (showInstallTip). */
export function useInstallPrompt() {
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [showInstallTip, setShowInstallTip] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as unknown as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const promptInstall = useCallback(() => {
    if (installEvt) void installEvt.prompt();
    else setShowInstallTip(true);
  }, [installEvt]);

  return { installEvt, showInstallTip, setShowInstallTip, promptInstall };
}
