"use server";

import { redirect } from "next/navigation";
import { getMemberForUser } from "@/lib/auth/members";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Invalid email or password." };

  const member = await getMemberForUser(data.user);
  if (!member) {
    await supabase.auth.signOut();
    return { error: "Your account is not authorized." };
  }
  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
