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
      .then((res) => res.json())
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!session?.user) {
    return (
      <a
        href="/api/auth/signin"
        className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] hover:text-foreground"
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {showLabel && (
        <span className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          Signed in as
        </span>
      )}
      <span className="text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
        {session.user.email}
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
