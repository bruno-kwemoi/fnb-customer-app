import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";

/**
 * Verifies the X-Line-Signature header on incoming webhook requests.
 * Reject the request if this returns false — prevents spoofed webhooks.
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(rawBody)
    .digest("base64");
  return hash === signature;
}

/**
 * Sends a push message to a specific LINE user (order confirmations,
 * expiration alerts, etc). Requires the store's channel access token.
 */
export async function pushLineMessage(
  channelAccessToken: string,
  to: string,
  messages: Array<{ type: string; text: string }>
) {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LINE push message failed (${res.status}): ${errText}`);
  }
  return res.json();
}

/**
 * Verifies a LIFF ID token server-side and returns the real, LINE-
 * confirmed userId it belongs to. Used for the staff/admin LINE
 * access flow specifically — unlike the customer flow (which trusts
 * whatever lineUserId the client sends, a documented, accepted
 * shortcut for a pilot), staff actions change real order state, so
 * a client claiming to be a given userId isn't good enough; this
 * confirms it against LINE directly.
 *
 * Requires "ID token" to be enabled for the LIFF app in the LINE
 * Developers Console (LIFF apps > your app > ID token: ON) — without
 * it, liff.getIDToken() returns null client-side and there's nothing
 * to verify here.
 */
export async function verifyLineIdToken(idToken: string): Promise<{ userId: string }> {
  const clientId = process.env.LINE_CHANNEL_ID;
  if (!clientId) throw new Error("LINE_CHANNEL_ID is not set");

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });

  if (!res.ok) {
    throw new Error(`ID token verification failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { sub: string; exp: number; aud: string };
  return { userId: data.sub };
}

/**
 * Fetches a LINE user's profile (display name, picture) server-side —
 * used on follow events to seed the customer record.
 */
export async function getLineUserProfile(
  channelAccessToken: string,
  userId: string
) {
  const res = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
    headers: { Authorization: `Bearer ${channelAccessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch LINE profile for ${userId}`);
  return res.json() as Promise<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  }>;
}
