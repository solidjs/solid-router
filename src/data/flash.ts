// The no-JS form convention's cookie codec. When a form posts to a server
// function without the client runtime (no instance header), the server
// handler redirects back carrying the outcome in a one-shot "flash" cookie;
// the next SSR pass reads it and seeds the router's submission state so
// useSubmission() renders the result exactly as a scripted submission would.
// Both codec halves live in this module so the write (src/server.ts, the
// handler's handleNoJS) and the read (provided to the router core by
// data/action.ts) can never drift apart. The cookie's name/clearing live in
// flashCookie.ts — the only piece the router core itself consumes — so this
// codec stays out of bundles that never load the action layer.

import { FLASH_COOKIE, matchFlashCookie } from "./flashCookie.js";

export { FLASH_COOKIE, hasFlashCookie, clearFlashCookie } from "./flashCookie.js";

/** What rides the cookie: a Submission minus its lifecycle methods. */
export interface FlashSubmission {
  input: any[];
  url: string;
  result?: any;
  error?: any;
}

// Form payloads have no JSON encoding, so entries are captured as pair
// arrays under a marker key ($f / $u) and revived to real FormData /
// URLSearchParams on the way out. File entries cannot ride a cookie and are
// dropped.
function encodeInputValue(value: any) {
  if (value instanceof FormData)
    return { $f: [...value.entries()].filter(([, v]) => typeof v === "string") };
  if (value instanceof URLSearchParams) return { $u: [...value.entries()] };
  return value;
}

function decodeInputValue(value: any) {
  if (value && typeof value === "object") {
    if (Array.isArray(value.$f)) {
      const form = new FormData();
      for (const [k, v] of value.$f) form.append(k, v);
      return form;
    }
    if (Array.isArray(value.$u)) return new URLSearchParams(value.$u);
  }
  return value;
}

/**
 * Encodes the outcome of a no-JS submission as a Set-Cookie value. `url` is
 * the action url (pathname + search of the server function call) so the
 * seeded submission matches `useSubmission` filters; `thrown` errors land on
 * `error`, returned values on `result` (mirroring the scripted split).
 */
export function encodeFlashCookie(
  url: string,
  result: any,
  input: any[],
  thrown?: boolean
): string {
  const isError = result instanceof Error;
  const payload = {
    url,
    result: isError ? result.message : result,
    error: isError,
    thrown: !!thrown,
    input: input.map(encodeInputValue)
  };
  return `${FLASH_COOKIE}=${encodeURIComponent(
    JSON.stringify(payload)
  )}; Secure; HttpOnly; Path=/`;
}

/**
 * Decodes the flash cookie out of a request's Cookie header. Returns
 * undefined when absent or unreadable (a malformed cookie must never take
 * down SSR — it is cleared either way).
 */
export function decodeFlashCookie(cookieHeader: string | null): FlashSubmission | undefined {
  const match = matchFlashCookie(cookieHeader);
  if (!match) return;
  try {
    const payload = JSON.parse(decodeURIComponent(match));
    if (!payload || !payload.result) return;
    const result = payload.error ? new Error(payload.result) : payload.result;
    return {
      input: Array.isArray(payload.input) ? payload.input.map(decodeInputValue) : [],
      url: payload.url,
      result: payload.thrown ? undefined : result,
      error: payload.thrown ? result : undefined
    };
  } catch (error) {
    console.error(error);
  }
}
