import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getLineUserProfile, pushLineMessage } from "@/lib/line";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { resolveStoreIdServer } from "@/lib/store";

// This route handles the CUSTOMER-FACING LINE Official Account webhook.
// Configure this URL in the LINE Developers console under that channel's
// Messaging API settings (one webhook per store/channel).
//
// NOTE: which store this webhook belongs to needs to be resolvable per
// request. Simplest approach for a single-store pilot: hardcode via
// LINE_STORE_ID env var. For true multi-tenant (multiple restaurant
// clients / multiple LINE channels), route by destination channel ID
// in the payload instead — see comment below.

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  const channelSecret = process.env.LINE_CHANNEL_SECRET!;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const pb = await getAdminPocketBase();
  const storeId = await resolveStoreIdServer(pb);

  for (const event of body.events ?? []) {
    try {
      if (event.type === "follow") {
        await handleFollow(pb, storeId, channelAccessToken, event);
      } else if (event.type === "message" && event.message?.type === "text") {
        await handleTextMessage(pb, storeId, channelAccessToken, event);
      }
      // Extend here: "unfollow" (mark inactive), "postback" (rich menu
      // actions), etc.
    } catch (err) {
      // Log and continue — one bad event shouldn't 500 the whole batch,
      // since LINE retries the full webhook payload on failure.
      console.error("Error handling LINE event", event.type, err);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleFollow(
  pb: Awaited<ReturnType<typeof getAdminPocketBase>>,
  storeId: string,
  channelAccessToken: string,
  event: any
) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const existing = await pb
    .collection("customers")
    .getFirstListItem(`line_user_id="${lineUserId}"`)
    .catch(() => null);

  if (existing) return; // already registered (re-follow after block, etc.)

  const profile = await getLineUserProfile(channelAccessToken, lineUserId);

  await pb.collection("customers").create({
    line_user_id: lineUserId,
    display_name: profile.displayName,
    picture_url: profile.pictureUrl ?? "",
    store: storeId,
    loyalty_points: 0,
    loyalty_tier: "regular",
  });

  await pushLineMessage(channelAccessToken, lineUserId, [
    {
      type: "text",
      text: `友だち追加ありがとうございます！🎉\nこちらのLINEからメニューのご注文・ポイント確認ができます。\n下のメニューから「注文する」を選んでください。`,
    },
  ]);
}

async function handleTextMessage(
  pb: Awaited<ReturnType<typeof getAdminPocketBase>>,
  storeId: string,
  channelAccessToken: string,
  event: any
) {
  const lineUserId = event.source?.userId;
  const text = (event.message.text as string).trim();

  // Minimal keyword router for Phase 1. Replace with LIFF rich menu
  // buttons for the primary flows (ordering) — chat text is a fallback.
  if (text === "ポイント" || text.toLowerCase() === "points") {
    const customer = await pb
      .collection("customers")
      .getFirstListItem(`line_user_id="${lineUserId}"`)
      .catch(() => null);

    await pushLineMessage(channelAccessToken, lineUserId, [
      {
        type: "text",
        text: customer
          ? `現在のポイント：${customer.loyalty_points}pt（${customer.loyalty_tier}）`
          : "お客様情報が見つかりませんでした。",
      },
    ]);
  }
}
