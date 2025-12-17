"use client";

import { useState } from "react";
import Link from "next/link";

export default function NukePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; deletedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNuke = async () => {
    if (!confirm("Are you sure you want to DELETE ALL schedule entries? This cannot be undone!")) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/nuke-schedule", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete entries");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] bg-background p-8 text-foreground">
        <h1 className="mb-6 text-3xl font-light">🧨 Nuclear Option</h1>

        <div className="mb-6 rounded-2xl border border-red-500 bg-red-50 p-4 dark:bg-red-950">
          <p className="mb-3 text-sm font-semibold text-red-900 dark:text-red-100">
            ⚠️ DANGER ZONE
          </p>
          <p className="mb-3 text-sm leading-relaxed text-red-800 dark:text-red-200">
            Your schedule entries are corrupted with 2.1 MILLION characters of garbage data in the repeatDays field.
          </p>
          <p className="text-sm leading-relaxed text-red-800 dark:text-red-200">
            This button will delete ALL 5 schedule entries from the database. You'll need to recreate them manually afterward.
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-4">
          <p className="mb-2 text-sm font-semibold">The corrupted entries are:</p>
          <ul className="space-y-1 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
            <li>• Comms Training (09:00-10:00) - 4MB corrupted</li>
            <li>• Upwork Hunt (12:00-16:00) - 4MB corrupted</li>
            <li>• Job Hunt (08:00-09:00) - 4MB corrupted</li>
            <li>• Scripting (10:00-11:00) - 4MB corrupted</li>
            <li>• Workout (11:00-12:00) - 4MB corrupted</li>
          </ul>
          <p className="mt-3 text-sm font-semibold">Total: 20MB of corrupted data</p>
        </div>

        <button
          onClick={handleNuke}
          disabled={loading}
          className="mb-4 w-full rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Deleting..." : "🧨 Delete ALL Schedule Entries"}
        </button>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mb-4 rounded-2xl border border-green-500 bg-green-50 p-4 text-sm dark:bg-green-950">
            <p className="mb-3 font-semibold text-green-900 dark:text-green-100">
              ✓ Deletion complete!
            </p>
            <div className="space-y-2 text-green-800 dark:text-green-200">
              <p>
                <strong>Deleted:</strong> {result.deletedCount} corrupted entries
              </p>
              <p className="mt-3">
                Your database should now be much smaller. Go back to the app and recreate your schedule entries.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-4">
          <Link
            href="/"
            className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:text-foreground"
          >
            ← Back to app
          </Link>
          <Link
            href="/cleanup"
            className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:text-foreground"
          >
            View analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
