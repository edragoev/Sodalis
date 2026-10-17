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

// The elder this device is linked to. It outlives a profile sign-out so "Switch profile"
// can go back to the profile picker instead of asking for the phone number again.
const ELDER_KEY = "sodalis.elder";

export type Elder = { senior_id: string; name?: string };

export function getElder(): Elder | null {
  try {
    const raw = localStorage.getItem(ELDER_KEY);
    return raw ? (JSON.parse(raw) as Elder) : null;
  } catch {
    return null;
  }
}

export function saveElder(e: Elder) {
  try {
    localStorage.setItem(ELDER_KEY, JSON.stringify(e));
  } catch {}
}

export function clearElder() {
  try {
    localStorage.removeItem(ELDER_KEY);
  } catch {}
}
