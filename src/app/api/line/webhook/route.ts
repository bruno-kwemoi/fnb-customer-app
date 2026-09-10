import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getLineUserProfile, pushLineMessage } from "@/lib/line";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { resolveStoreIdServer } from "@/lib/store";

// This route handles the CUSTOMER-FACING LINE Official Account webhook.
// Configure this URL in the LINE Developers console under that channel's
// Messaging API settings (one webhook per store/channel):
//   https://<your-domain>/api/line/webhook
//
// Store resolution: resolveStoreIdServer() looks up the `stores`
// record by LINE_OA_ID (env var) — see src/lib/store.ts. That's a
// single fixed store per deployment. For true multi-tenant (several
// restaurant clients sharing one deployment), resolve per-request from
// the webhook payload's `destination` field instead, matched against
// a stored channel identifier — LINE_OA_ID alone can't distinguish
// between channels on one deployment.

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  const channelSecret = process.env.LINE_CHANNEL_SECRET!;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const events = body.events ?? [];

  // LINE's "Verify" button in the console sends a request with an
  // empty events array just to check for a 200. Bail out before doing
  // any PocketBase work — no need to authenticate as admin for a
  // no-op, and this keeps the response fast enough to avoid LINE's
  // webhook timeout.
  if (events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const pb = await getAdminPocketBase();
  const storeId = await resolveStoreIdServer(pb);

  for (const event of events) {
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

  // Staff/admin friending this same OA (see the "same OA" staff
  // access setup in README) shouldn't get turned into a customer
  // record with a welcome message meant for diners — check the staff
  // collection first and bail out if they're already registered
  // there.
  const staffRecord = await pb
    .collection("staffs")
    .getFirstListItem(`line_user_id="${lineUserId}"`)
    .catch(() => null);
  if (staffRecord) return;

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
    return;
  }

  // Hidden staff/admin dashboard shortcut — deliberately invisible to
  // everyone else. Unlike the "not registered" screen shown inside
  // the staff LIFF app itself, this stays completely silent for a
  // non-staff sender: no reply, no hint the keyword does anything,
  // since this is reached from the same chat every ordinary customer
  // uses. Registered-but-inactive staff (active=false) are treated
  // the same as non-staff here. Works for both roles — role isn't
  // checked, only active staff status.
  if (text === "スタッフ" || text.toLowerCase() === "staff") {
    const staff = await pb
      .collection("staffs")
      .getFirstListItem(`line_user_id="${lineUserId}" && active=true`)
      .catch(() => null);

    if (!staff) return;

    const staffLiffId = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;
    if (!staffLiffId) {
      console.error("[webhook] 'スタッフ' keyword matched but NEXT_PUBLIC_STAFF_LIFF_ID is not set");
      return;
    }

    await pushLineMessage(channelAccessToken, lineUserId, [
      {
        type: "text",
        text: `スタッフ注文管理はこちら：\nhttps://liff.line.me/${staffLiffId}/staff/liff/orders`,
      },
    ]);
    return;
  }

  // Same pattern, one level up — reports link only for active staff
  // whose role is specifically "admin". A non-admin staff member (or
  // anyone else) typing this gets silence, same reasoning as above:
  // no hint that a higher tier exists, not even an error.
  if (text === "管理者" || text.toLowerCase() === "admin") {
    const staff = await pb
      .collection("staffs")
      .getFirstListItem(`line_user_id="${lineUserId}" && active=true && role="admin"`)
      .catch(() => null);

    if (!staff) return;

    const staffLiffId = process.env.NEXT_PUBLIC_STAFF_LIFF_ID;
    if (!staffLiffId) {
      console.error("[webhook] '管理者' keyword matched but NEXT_PUBLIC_STAFF_LIFF_ID is not set");
      return;
    }

    await pushLineMessage(channelAccessToken, lineUserId, [
      {
        type: "text",
        text: `レポートはこちら：\nhttps://liff.line.me/${staffLiffId}/staff/liff/reports`,
      },
    ]);
    return;
  }

  // The one keyword open to literally everyone, including ordinary
  // customers — there's nothing privileged about the customer
  // ordering link, so no eligibility check is needed here. Mainly
  // useful for staff/admin sitting in the same chat wanting a way
  // back to ordering without the dashboard's own switcher button.
  if (text === "お客様" || text.toLowerCase() === "customer") {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      console.error("[webhook] 'お客様' keyword matched but NEXT_PUBLIC_LIFF_ID is not set");
      return;
    }

    await pushLineMessage(channelAccessToken, lineUserId, [
      {
        type: "text",
        text: `ご注文はこちら：\nhttps://liff.line.me/${liffId}/liff/menu`,
      },
    ]);
  }
}
