import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listNotifications } from "../lib/api";
import { onDataChanged } from "../lib/events";
import {
  currentPermission,
  fireBrowserNotification,
  notificationsSupported,
  requestNotificationPermission,
} from "../lib/browserNotify";
import { notificationKey, notificationText, notificationTitle } from "../lib/notifications";
import { pushSupported, subscribeToPush } from "../lib/push";
import type { Notification } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

// How often to check for new notifications while the app is open. Background
// tabs throttle timers to ~1/min, which is fine for a debt app.
const POLL_MS = 45_000;

type NotificationsContextValue = {
  items: Notification[];
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  permission: NotificationPermission;
  /** True if this device can do Web Push at all (SW + PushManager + Notification). */
  pushSupported: boolean;
  /** True once a push subscription is registered for this device. */
  pushActive: boolean;
  enableBrowserNotifications: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue>({
  items: [],
  count: 0,
  loading: false,
  refresh: async () => {},
  permission: "default",
  pushSupported: false,
  pushActive: false,
  enableBrowserNotifications: async () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export default function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(currentPermission());
  const [pushActive, setPushActive] = useState(false);

  // Keys we've already accounted for. `null` until the first load so we don't
  // notify for the whole pre-existing backlog right after sign-in.
  const seenRef = useRef<Set<string> | null>(null);
  // True once a real Web Push subscription is active — then the service worker
  // delivers notifications, so we skip the in-app polling fallback to avoid doubles.
  const pushActiveRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      seenRef.current = null;
      return;
    }
    setLoading(true);
    try {
      const next = await listNotifications();
      setItems(next);

      const keys = next.map(notificationKey);
      if (seenRef.current === null) {
        // First load: establish a baseline silently.
        seenRef.current = new Set(keys);
      } else {
        const fresh = next.filter((n) => !seenRef.current!.has(notificationKey(n)));
        seenRef.current = new Set(keys);
        // Only surface OS notifications when the tab isn't focused — when it is,
        // the in-app bell already updates live. Skip if real push is active
        // (the service worker will deliver those, avoiding duplicates).
        if (fresh.length && document.hidden && !pushActiveRef.current && Notification.permission === "granted") {
          if (fresh.length <= 3) {
            fresh.forEach((n) => fireBrowserNotification(notificationTitle(n), notificationText(n), notificationKey(n)));
          } else {
            fireBrowserNotification("Rivo", `Tienes ${fresh.length} novedades nuevas.`, "rivo-batch");
          }
        }
      }
    } catch {
      // Swallow: notifications are best-effort and shouldn't break the app.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh, profile?.id]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const unsubscribe = onDataChanged(refresh);
    const interval = window.setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [refresh, user]);

  const enableBrowserNotifications = useCallback(async () => {
    if (!notificationsSupported()) return;
    const p = await requestNotificationPermission();
    setPermission(p);
    if (p === "granted") {
      // Register for real Web Push (works with the app closed) where available.
      const ok = await subscribeToPush();
      pushActiveRef.current = ok;
      setPushActive(ok);
      fireBrowserNotification("Notificaciones activadas", "Te avisaremos aquí cuando haya novedades.", "rivo-welcome");
    }
  }, []);

  // If permission was already granted in a previous session, make sure this
  // device has an up-to-date push subscription stored.
  useEffect(() => {
    if (!user || permission !== "granted") return;
    subscribeToPush().then((ok) => {
      pushActiveRef.current = ok;
      setPushActive(ok);
    });
  }, [user, permission]);

  return (
    <NotificationsContext.Provider
      value={{
        items,
        count: items.length,
        loading,
        refresh,
        permission,
        pushSupported: pushSupported(),
        pushActive,
        enableBrowserNotifications,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
