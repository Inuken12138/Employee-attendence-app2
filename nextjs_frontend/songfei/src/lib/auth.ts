export function hasAuthToken(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.localStorage.getItem('token'));
}

export function buildLoginRedirectUrl(targetPath: string): string {
  return `/login?redirect=${encodeURIComponent(targetPath)}`;
}
