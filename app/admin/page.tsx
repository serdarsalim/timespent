import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const ADMIN_COOKIE = "cadencia-admin-auth";
const ADMIN_HASH_PREFIX = "cadencia-admin";
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const getAdminHash = () => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash("sha256")
    .update(`${ADMIN_HASH_PREFIX}:${password}`)
    .digest("hex");
};

const isAuthorized = async () => {
  const hash = getAdminHash();
  if (!hash) return false;
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value === hash;
};

const setAdminCookie = async () => {
  const hash = getAdminHash();
  if (!hash) return;
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, hash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  });
};

const clearAdminCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
};

async function handleLogin(formData: FormData) {
  "use server";
  const password = formData.get("password");
  const adminHash = getAdminHash();
  if (!adminHash || typeof password !== "string") {
    redirect("/admin?error=1");
  }
  const submittedHash = createHash("sha256")
    .update(`${ADMIN_HASH_PREFIX}:${password}`)
    .digest("hex");
  if (submittedHash !== adminHash) {
    redirect("/admin?error=1");
  }
  await setAdminCookie();
  redirect("/admin");
}

async function handleLogout() {
  "use server";
  await clearAdminCookie();
  redirect("/admin");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const adminHash = getAdminHash();
  if (!adminHash) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16 text-left">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-3 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          Set `ADMIN_PASSWORD` in your environment to enable the admin panel.
        </p>
      </main>
    );
  }

  if (!(await isAuthorized())) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-16 text-left">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <form action={handleLogin} className="mt-6 space-y-3">
          <input
            type="password"
            name="password"
            className="w-full rounded-full border border-[color-mix(in_srgb,var(--foreground)_20%,transparent)] bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground"
            placeholder="Admin password"
          />
          {resolvedSearchParams?.error ? (
            <div className="text-xs text-[#ef4444]">Incorrect password.</div>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-full border border-foreground px-4 py-2 text-sm font-semibold transition hover:bg-foreground hover:text-background"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  const [userCount, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      select: { email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-left">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <form action={handleLogout}>
          <button
            type="submit"
            className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-3 py-1.5 text-xs text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:border-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
      <div className="mt-8 rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          Total users
        </p>
        <div className="mt-3 text-4xl font-semibold">{userCount}</div>
      </div>
      <div className="mt-6 rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          Users
        </p>
        <div className="mt-4 space-y-2 text-sm text-[color-mix(in_srgb,var(--foreground)_75%,transparent)]">
          {users.length === 0 ? (
            <div>No users yet.</div>
          ) : (
            users.map((user, index) => (
              <div
                key={`${user.email ?? "unknown"}-${user.createdAt.toISOString()}-${index}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="truncate text-foreground">
                  {user.email ?? "Unknown email"}
                </span>
                <span className="whitespace-nowrap text-xs text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  {user.createdAt.toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
