// Base-aware URL helpers. `import.meta.env.BASE_URL` is "/" during local dev
// and "/rivo/" in the GitHub Pages production build (see vite.config.ts), so
// every public asset and the OAuth redirect must resolve against it instead of
// a hardcoded leading slash — otherwise they'd 404 under the /rivo/ subpath.
const BASE = import.meta.env.BASE_URL;

/** Resolve a public asset path (e.g. "brand/app-icon.svg") under the app base. */
export function asset(path: string): string {
  return BASE + path.replace(/^\/+/, "");
}

/** Absolute URL of the app root, e.g. https://dioneldaf.github.io/rivo/. */
export function appUrl(): string {
  return window.location.origin + BASE;
}
