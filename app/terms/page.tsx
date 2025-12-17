"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/branding";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16 text-left">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          Terms & consent
        </p>
        <h1 className="text-5xl font-light text-foreground">Terms of Use</h1>
        <div className="space-y-4 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          <p>
            By accessing or using {APP_NAME}, you agree that the experience is
            provided &quot;as is&quot; without warranties of any kind. We make no
            guarantees about accuracy, availability, or fitness for any purpose.
          </p>
          <p>
            You acknowledge that you are solely responsible for any actions,
            decisions, or outcomes that result from using {APP_NAME}. We are not
            liable for any losses, damages, or claims that may arise from your
            use of the app.
          </p>
          <p>
            By visiting this site you consent to these terms in full. If you do
            not agree, please discontinue use immediately.
          </p>
        </div>
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] transition hover:text-foreground"
        >
          ← Back to app
        </Link>
      </main>
    </div>
  );
}
