import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";

// The `customers` collection stays admin-only in PocketBase (it holds
// real names, LINE user IDs, and loyalty balances — not something to
// expose via a public list/view rule). This route looks a customer up
// server-side by their own LINE user ID and returns only what the
// loyalty screen needs.
//
// NOTE: this trusts the lineUserId passed by the client, the same way
// the original direct-PocketBase-query design did — it isn't verified
// against the LIFF session server-side. Fine for a pilot; if this
// goes further, verify via liff.getIDToken() + LINE's token verify
// endpoint before trusting it.
export async function GET(req: NextRequest) {
  const lineUserId = req.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
  }

  try {
    const pb = await getAdminPocketBase();
    const customer = await pb
      .collection("customers")
      .getFirstListItem(`line_user_id="${lineUserId}"`);

    return NextResponse.json({
      displayName: customer.display_name,
      loyaltyPoints: customer.loyalty_points,
      loyaltyTier: customer.loyalty_tier,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer lookup failed" },
      { status: 404 }
    );
  }
}
