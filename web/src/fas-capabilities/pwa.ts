// Import this module once from the browser entry point after installing SDK >=0.16.15.
import { startPwa } from '@freeappstore/sdk/pwa';
export const pwa = startPwa();

// Register a busy guard: if the user has unsaved form changes, prompt before
// the PWA update reloads the page. The flag is set by App.tsx via window.__pitstopDirty.
pwa.addBusyGuard(() => {
  return Boolean((window as unknown as Record<string, unknown>).__pitstopDirty);
});
