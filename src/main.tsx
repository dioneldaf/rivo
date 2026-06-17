import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// HashRouter (URLs like /rivo/#/groups/123) keeps deep links and page refreshes
// working on GitHub Pages, which has no server-side rewrite to index.html.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// Register the service worker (enables Web Push + PWA install). Path and scope
// must honor the app base (/rivo/ in production) or the SW won't control the app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* non-fatal: app still works without it */
    });
  });
}
