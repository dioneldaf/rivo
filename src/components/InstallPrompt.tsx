import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, Share, X } from "lucide-react";
import { asset } from "../lib/paths";

// Chrome/Edge/Android fire this; we capture it to trigger install on demand.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "rivo-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no beforeinstallprompt — offer manual instructions instead.
    if (isIOS()) {
      setIosHelp(true);
      setShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  };

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:bottom-4 sm:left-auto sm:right-4 sm:px-0"
        >
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:max-w-sm">
            <img src={asset("brand/app-icon.svg")} alt="" className="h-11 w-11 shrink-0 rounded-xl shadow-glow" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Instala Rivo</p>
              {iosHelp ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Pulsa <Share className="inline h-3.5 w-3.5" /> y “Añadir a pantalla de inicio”.
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Tenla a un toque, como una app nativa.
                </p>
              )}
            </div>
            {!iosHelp ? (
              <button
                onClick={install}
                className="bg-gradient-brand inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-glow transition active:scale-[0.97]"
              >
                <Download className="h-4 w-4" /> Instalar
              </button>
            ) : null}
            <button
              onClick={dismiss}
              aria-label="Descartar"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
