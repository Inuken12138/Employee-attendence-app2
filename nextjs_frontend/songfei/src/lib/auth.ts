/**
 * Small authentication helpers used by client pages before they call protected APIs.
 *
 * The frontend keeps the login token in localStorage, so these helpers only need
 * to answer two onboarding questions: "is the user logged in?" and "where should
 * we send them if they need to log in first?"
 */

/** Returns true when a browser session already has a saved API token. */
export function hasAuthToken(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.localStorage.getItem('token'));
}

/** Builds the login page URL and preserves the page the user wanted to open. */
export function buildLoginRedirectUrl(targetPath: string): string {
  return `/login?redirect=${encodeURIComponent(targetPath)}`;
}
