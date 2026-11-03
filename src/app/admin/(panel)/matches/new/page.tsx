import { connection } from "next/server";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/members";
import { UploadForm } from "./upload-form";

export default function NewMatchPage() {
  return (
    <Suspense fallback={null}>
      <NewMatch />
    </Suspense>
  );
}

async function NewMatch() {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const member = await requireMember();
  return (
    <>
      <h1 className="mb-6 font-display text-5xl leading-none tracking-wide text-neutral-900">New match</h1>
      <UploadForm role={member.role} team={member.team} />
    </>
  );
}
