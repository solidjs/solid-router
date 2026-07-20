// The flash cookie's name and one-shot clearing — split from the codec in
// flash.ts so the router core can consume the cookie eagerly (the clear must
// be appended before streaming flushes the response headers, and an unread
// outcome must not haunt a later request) without carrying the encode/decode
// machinery into client bundles that never load the action layer.

export const FLASH_COOKIE = "flash";

const FLASH_MATCHER = new RegExp(`(?:^|;\\s*)${FLASH_COOKIE}=([^;]+)`);

/** Whether a Cookie header carries a flash cookie (readable or not). */
export function hasFlashCookie(cookieHeader: string | null): boolean {
  return !!cookieHeader && FLASH_MATCHER.test(cookieHeader);
}

/** The raw encoded flash payload out of a Cookie header, if present. */
export function matchFlashCookie(cookieHeader: string | null): string | undefined {
  const match = cookieHeader && cookieHeader.match(FLASH_MATCHER);
  return match ? match[1] : undefined;
}

/** The Set-Cookie value clearing the flash cookie after it has been read. */
export function clearFlashCookie(): string {
  return `${FLASH_COOKIE}=; Max-Age=0; Path=/`;
}
