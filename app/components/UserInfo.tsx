"use client";

import { useEffect, useState } from "react";

type Session = {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
} | null;

type UserInfoProps = {
  showLabel?: boolean;
};

export function UserInfo({ showLabel = false }: UserInfoProps) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (res) => {
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Non-JSON session response");
        }
        return res.json();
      })
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!session?.user) {
    if (showLabel) {
      return null;
    }
    const openAuthPopup = (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      window.open(
        '/api/auth/signin',
        'Sign in',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    };

    return (
      <div className="flex items-center gap-3">
        <a
          href="/api/auth/signin"
          onClick={openAuthPopup}
          className="hidden cursor-pointer text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] hover:text-foreground sm:inline"
        >
          Sign in
        </a>
        <span className="hidden text-[color-mix(in_srgb,var(--foreground)_30%,transparent)] sm:inline">
          /
        </span>
        <a
          href="/api/auth/signin"
          onClick={openAuthPopup}
          className="cursor-pointer rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-3 py-1 text-xs font-semibold text-foreground transition hover:border-foreground sm:border-0 sm:p-0 sm:text-sm sm:font-normal sm:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:hover:text-foreground"
          title="Create an account to save your goals and tracker data permanently. Demo data is not saved."
        >
          Sign up
        </a>
      </div>
    );
  }

  // When logged in, show nothing in navbar (sign out is in settings)
  if (!showLabel) {
    return null;
  }

  // Only show user info when showLabel is true (in settings/footer)
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
        Logged in as{" "}
        <span className="normal-case tracking-normal text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]">
          {session.user.email}
        </span>
      </span>
      <a
        href="/api/auth/signout"
        className="text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] hover:text-foreground"
      >
        Sign out
      </a>
    </div>
  );
}
