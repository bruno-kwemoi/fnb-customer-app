"use client";

import liff from "@line/liff";

let initPromise: Promise<void> | null = null;

/**
 * Initializes LIFF once per page load. Safe to call from multiple
 * components — subsequent calls reuse the same in-flight/completed init.
 */
export function initLiff(): Promise<void> {
  if (!initPromise) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      throw new Error("NEXT_PUBLIC_LIFF_ID is not set");
    }
    initPromise = liff.init({ liffId }).then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
      }
    });
  }
  return initPromise;
}

export async function getLineProfile() {
  await initLiff();
  return liff.getProfile(); // { userId, displayName, pictureUrl, statusMessage }
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
