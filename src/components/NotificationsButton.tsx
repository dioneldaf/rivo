import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import IconButton from "./ui/IconButton";
import NotificationList from "./NotificationList";
import { useNotifications } from "../providers/NotificationsProvider";

export default function NotificationsButton() {
  const { items, count, permission, supported, enableBrowserNotifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton label="Notificaciones" onClick={() => setOpen((v) => !v)}>
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right animate-scale-in rounded-3xl border border-slate-200/80 bg-white p-2 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold">Notificaciones</p>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          {supported && permission === "default" ? (
            <button
              onClick={enableBrowserNotifications}
              className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2.5 text-left text-sm text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
            >
              <BellRing className="h-4 w-4 shrink-0" />
              <span>Activar notificaciones del navegador</span>
            </button>
          ) : null}
          {supported && permission === "denied" ? (
            <p className="mx-1 mb-1 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-400 dark:bg-slate-800/60">
              Las notificaciones están bloqueadas. Habilítalas en los ajustes del sitio en tu navegador.
            </p>
          ) : null}
          <div className="max-h-[60vh] overflow-y-auto">
            <NotificationList items={items} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
