const KEY = "sodalis.session";

export type Session = { member_id: string; senior_id: string; name?: string };

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
