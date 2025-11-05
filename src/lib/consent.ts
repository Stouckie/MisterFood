/**
 * Consentement minimal (sans analytics).
 * Cookie SameSite=Lax + Secure — 180 jours.
 */
export const CONSENT_COOKIE = "mf_consent_v1";
export type ConsentChoice = "accepted" | "refused";

const hasDocument = () => typeof document !== "undefined";

function parseCookies(): Record<string, string> {
  if (!hasDocument()) return {};
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .reduce((acc, kv) => {
      const i = kv.indexOf("=");
      if (i === -1) return acc;
      acc[kv.slice(0, i)] = kv.slice(i + 1);
      return acc;
    }, {} as Record<string, string>);
}

export function getConsent(): ConsentChoice | null {
  if (!hasDocument()) return null;
  const v = parseCookies()[CONSENT_COOKIE];
  if (!v) return null;
  try {
    return JSON.parse(decodeURIComponent(v)) as ConsentChoice;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice, days = 180): void {
  if (!hasDocument()) return;
  const maxAge = Math.max(1, Math.floor(days * 24 * 60 * 60));
  const val = encodeURIComponent(JSON.stringify(choice));
  document.cookie = `${CONSENT_COOKIE}=${val}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

export function clearConsent(): void {
  if (!hasDocument()) return;
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export const hasMadeChoice = () => getConsent() !== null;
