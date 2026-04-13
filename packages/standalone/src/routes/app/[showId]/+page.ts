// The editor loads data client-side from IndexedDB. SSR would render
// "Loading..." and then hydrate, but the heavy ScheduleEditor import
// can block hydration. Disable SSR so the page renders entirely on the
// client where IndexedDB is available.
export const ssr = false;
