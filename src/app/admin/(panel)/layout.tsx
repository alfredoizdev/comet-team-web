import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { requireMember } from "@/lib/auth/members";
import { CLUB_NAME, CREST_SRC } from "@/lib/teams";
import { signOut } from "../login/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const member = await requireMember();
  const roleLabel = member.role === "admin" ? "Admin" : member.team === "girls" ? "Girls coach" : "Boys coach";

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <header className="bg-boys text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-white">
              <Image src={CREST_SRC} alt={`${CLUB_NAME} crest`} width={32} height={32} className="size-8 object-contain" />
            </span>
            <span className="font-display text-2xl leading-none tracking-wide sm:text-3xl">Comets Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{roleLabel}</span>
            <span className="hidden text-sm text-white/70 sm:inline">{member.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
