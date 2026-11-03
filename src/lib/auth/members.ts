import { redirect } from "next/navigation";
import type { Role, Team } from "@/lib/db/types";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type Member = { userId: string; email: string; role: Role; team: Team | null };

/** Admins manage both teams; a coach manages only their own. */
export function canManage(member: Pick<Member, "role" | "team">, team: Team): boolean {
  return member.role === "admin" || member.team === team;
}

export function assertCanManage(member: Pick<Member, "role" | "team">, team: Team): void {
  if (!canManage(member, team)) throw new Error("Forbidden");
}

/** Looks up the signed-in user in `club_members` by lower-cased email. */
export async function getMemberForUser(user: { id: string; email?: string | null }): Promise<Member | null> {
  if (!user.email) return null;
  const email = user.email.toLowerCase();
  const { data } = await createServiceClient()
    .from("club_members")
    .select("email, role, team")
    .eq("email", email)
    .maybeSingle();
  if (!data) return null;
  return { userId: user.id, email, role: data.role as Role, team: (data.team as Team | null) ?? null };
}

/** Current member or redirect to the admin sign-in page. */
export async function requireMember(): Promise<Member> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = user ? await getMemberForUser(user) : null;
  if (!member) redirect("/admin/login");
  return member;
}
