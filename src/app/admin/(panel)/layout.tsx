import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
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
    <div className="flex min-h-dvh flex-col bg-[#f4f5f8]">
      <header className="bg-boys text-white">
        <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between gap-3 px-3 sm:h-16 sm:gap-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-2 sm:gap-3">
            <span className="flex size-[34px] items-center justify-center rounded-full bg-white sm:size-10">
              <Image src={CREST_SRC} alt={`${CLUB_NAME} crest`} width={32} height={32} className="size-7 object-contain sm:size-8" />
            </span>
            <span className="font-display text-[22px] leading-none tracking-[0.03em] sm:text-[28px]">Comets Admin</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="rounded-full bg-white/15 px-2 py-[3px] text-[11px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs">{roleLabel}</span>
            <span className="hidden text-sm font-medium text-[#dce2ef] md:inline">{member.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 rounded-lg border border-white/40 px-3 text-[13px] font-semibold text-white transition hover:bg-white/10 sm:min-h-9 sm:px-3.5 sm:text-sm"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-3 py-3 sm:px-8 sm:pb-12 sm:pt-6">{children}</main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
