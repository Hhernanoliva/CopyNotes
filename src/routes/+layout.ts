// CopyNotes is a client-side local-first app: all data lives in IndexedDB and
// every screen is built in the browser. Prerendering the shell to a static
// index.html lets the service worker serve it offline (navigateFallback: '/').
export const prerender = true;
export const ssr = true;
