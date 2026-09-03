// Minimal staff-facing access control: a single shared passcode
// (STAFF_ACCESS_CODE), sent as the `x-staff-code` header, checked
// against the env var. This is intentionally NOT per-staff auth —
// there's no login, no user identity, no audit trail of who changed
// what. It's a fast way to keep the order dashboard off the open
// internet for a pilot. Before wider rollout, replace this with a
// real PocketBase auth collection (per-staff accounts) so status
// changes can be attributed to a person.
//
// Fails closed: if STAFF_ACCESS_CODE isn't set in the environment,
// every request is rejected rather than silently left open.
export function verifyStaffCode(req: Request): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) return false;
  const provided = req.headers.get("x-staff-code");
  return provided === expected;
}
