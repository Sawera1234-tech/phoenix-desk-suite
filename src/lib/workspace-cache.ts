// Workspace cache isolation for multi-tenant accounts.
// Removes all device-local Project Phoenix state (localStorage drafts,
// demand overrides, backup settings) and the React Query cache so that
// data cached for one account can never be shown to another.

const PREFIX = "phoenix.";

export function clearWorkspaceLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // storage unavailable: nothing to clear
  }
}

// Stores the id of the account whose device-local state is currently on disk.
const ACTIVE_USER_KEY = "phoenix.auth.activeUserId";

export function getActiveUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

export function setActiveUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (userId) window.localStorage.setItem(ACTIVE_USER_KEY, userId);
    else window.localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    // ignore
  }
}
