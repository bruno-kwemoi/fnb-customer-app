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
