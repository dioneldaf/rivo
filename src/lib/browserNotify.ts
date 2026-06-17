// Thin wrapper around the Web Notifications API. Browser notifications work
// while the app is open (incl. a background tab); they don't require a server.

import { asset } from "./paths";

const ICON = asset("brand/app-icon-1024.png");

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function currentPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : "denied";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    // Older Safari uses a callback signature that can throw on the promise form.
    return Notification.permission;
  }
}

export async function fireBrowserNotification(title: string, body: string, tag?: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  // Android (and any installed PWA) forbids the `new Notification()` constructor
  // and throws "Illegal constructor" — notifications MUST be shown through the
  // service worker. So prefer the SW registration; only fall back to the
  // constructor on desktop browsers where the SW isn't controlling the page.
  if ("serviceWorker" in navigator) {
    try {
      const reg =
        (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: ICON });
        return;
      }
    } catch {
      // fall through to the constructor
    }
  }

  try {
    const n = new Notification(title, { body, tag, icon: ICON });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some mobile browsers only allow notifications via a service worker and
    // throw on the constructor; fail silently rather than break the app.
  }
}
