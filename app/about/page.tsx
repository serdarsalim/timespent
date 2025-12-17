"use client";

import Link from "next/link";
import {
  APP_FEATURES,
  APP_LONG_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
} from "@/lib/branding";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16 text-left">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          {APP_TAGLINE}
        </p>
        <h1 className="text-5xl font-light text-foreground">{APP_NAME}</h1>
        <p className="text-base text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          {APP_LONG_DESCRIPTION}
        </p>
        <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          {APP_FEATURES.map((feature) => (
            <span key={feature}>{feature}</span>
          ))}
        </div>
        <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          <p>
            SLMTRACK is built for personal clarity—capture your schedule, track
            productivity across every time horizon, and define lightweight OKRs
            that stay top of mind without visual noise. It is a personal
            workspace and does not provide professional advice. By using the
            product you acknowledge it is provided as-is.
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
