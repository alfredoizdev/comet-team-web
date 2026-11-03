"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLUB_NAME, CREST_SRC } from "@/lib/teams";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = {};

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-boys px-4 py-12 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <Image src={CREST_SRC} alt={`${CLUB_NAME} crest`} width={64} height={64} className="size-16 object-contain" />
          </span>
          <div>
            <h1 className="font-display text-4xl leading-none tracking-wide">{CLUB_NAME}</h1>
            <p className="mt-1 text-sm text-white/70">Admin sign in</p>
          </div>
        </div>

        <form action={action} className="flex flex-col gap-4 rounded-xl bg-white p-6 text-neutral-900 shadow-lg">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-red-600">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="bg-boys text-white hover:bg-boys-deep">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
