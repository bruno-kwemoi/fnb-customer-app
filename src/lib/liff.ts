"use client";

import liff from "@line/liff";

// A single browser page only ever initializes LIFF once, with
// whichever liffId that page's LINE entry point (customer rich menu
// vs. staff rich menu / link) actually resolves to. This map exists
// so calling initLiff() repeatedly within the same page (from
// multiple components) reuses the same in-flight/completed init
// rather than re-initializing.
const initPromises = new Map<string, Promise<void>>();

/**
 * Initializes LIFF once per page load for the given liffId (defaults
 * to the customer app's NEXT_PUBLIC_LIFF_ID). Pass the staff app's ID
 * explicitly from /staff/liff pages.
 */
export function initLiff(liffId?: string): Promise<void> {
  const id = liffId ?? process.env.NEXT_PUBLIC_LIFF_ID;
  if (!id) {
    throw new Error("NEXT_PUBLIC_LIFF_ID is not set (and no liffId was passed explicitly)");
  }
  if (!initPromises.has(id)) {
    initPromises.set(
      id,
      liff.init({ liffId: id }).then(() => {
        if (!liff.isLoggedIn()) {
          liff.login();
        }
      })
    );
  }
  return initPromises.get(id)!;
}

export async function getLineProfile(liffId?: string) {
  await initLiff(liffId);
  return liff.getProfile(); // { userId, displayName, pictureUrl, statusMessage }
}

/**
 * Raw LIFF ID token for server-side verification (see
 * verifyLineIdToken in lib/line.ts) — used by the staff/admin flow,
 * where a claimed userId alone isn't trusted. Requires "ID token" to
 * be enabled for this LIFF app in the LINE Developers Console;
 * returns null if it isn't (or the user isn't logged in yet, which
 * initLiff's liff.login() call should prevent in practice).
 */
export async function getLineIdToken(liffId?: string): Promise<string | null> {
  await initLiff(liffId);
  return liff.getIDToken();
}

export function closeLiffWindow() {
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

export function sendLiffMessage(text: string) {
  if (liff.isInClient()) {
    return liff.sendMessages([{ type: "text", text }]);
  }
}

export default liff;
