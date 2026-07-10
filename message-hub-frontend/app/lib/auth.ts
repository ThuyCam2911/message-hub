const TOKEN_KEY = 'mh_token';
const USER_KEY = 'mh_user';

export interface CurrentUser {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: CurrentUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function hasRole(...roles: CurrentUser['role'][]): boolean {
  const user = getCurrentUser();
  return !!user && roles.includes(user.role);
}
