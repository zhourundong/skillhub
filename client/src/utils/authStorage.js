const TOKEN_KEY = 'token';
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at';
export const AUTH_SESSION_CLEARED_EVENT = 'auth:session-cleared';

function decodeTokenExpiresAt(token) {
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(window.atob(padded));

    return decoded?.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
  }
}

export function getStoredExpiresAt(token) {
  const rawValue = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
  const storedValue = rawValue ? Number(rawValue) : null;

  if (storedValue && Number.isFinite(storedValue)) {
    return storedValue;
  }

  const decodedValue = decodeTokenExpiresAt(token);
  if (decodedValue) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(decodedValue));
  }

  return decodedValue;
}

export function getStoredToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const expiresAt = getStoredExpiresAt(token);
  if (expiresAt && Date.now() >= expiresAt) {
    clearAuthSession();
    return null;
  }

  return token;
}

export function persistAuthSession(token, expiresAt) {
  localStorage.setItem(TOKEN_KEY, token);

  const resolvedExpiresAt = expiresAt || decodeTokenExpiresAt(token);
  if (resolvedExpiresAt) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(resolvedExpiresAt));
  } else {
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  }
}
