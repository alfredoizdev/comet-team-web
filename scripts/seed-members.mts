// Seeds club_members and invites each person by email (they pick their own password).
// Usage: pnpm --dir worker exec tsx --env-file=../.env.local ../scripts/seed-members.mts admin@x.com:admin coach@x.com:coach:girls
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "coach";
type Team = "girls" | "boys";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: seed-members.mts email:admin email:coach:girls email:coach:boys …");
  process.exit(1);
}
const members = args.map((a) => {
  const [email, role, team] = a.split(":") as [string, Role, Team | undefined];
  if (!email || !["admin", "coach"].includes(role)) throw new Error(`bad entry: ${a}`);
  if (role === "coach" && !["girls", "boys"].includes(team ?? "")) throw new Error(`coach needs a team: ${a}`);
  return { email: email.toLowerCase(), role, team: role === "admin" ? null : (team as Team) };
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { error } = await supabase.from("club_members").upsert(members, { onConflict: "email" });
if (error) throw error;
console.log(`club_members: ${members.length} upserted`);

for (const m of members) {
  const { error: invErr } = await supabase.auth.admin.inviteUserByEmail(m.email, {
    redirectTo: `${process.env.SITE_URL ?? "http://localhost:3000"}/admin/login`,
  });
  console.log(invErr ? `invite ${m.email}: ${invErr.message}` : `invite sent to ${m.email}`);
}
