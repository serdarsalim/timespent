"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type CleanupResult = {
  deleted: {
    scheduleEntries: number;
    productivityRatings: number;
  };
  cutoffDate: string;
};

type Analysis = {
  scheduleEntries: {
    total: number;
    oldEntries: number;
    size: { bytes: number; kb: number; mb: number };
  };
  productivityRatings: {
    total: number;
    oldEntries: number;
    size: { bytes: number; kb: number; mb: number };
  };
  weeklyNotes: {
    total: number;
    size: { bytes: number; kb: number; mb: number };
    avgContentLength: number;
  };
  monthEntries: {
    total: number;
    size: { bytes: number; kb: number; mb: number };
    avgContentLength: number;
  };
  goals: {
    total: number;
    size: { bytes: number; kb: number; mb: number };
  };
  focusAreas: {
    total: number;
    size: { bytes: number; kb: number; mb: number };
  };
};

export default function CleanupPage() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysis();
  }, []);

  const fetchAnalysis = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/cleanup");
      if (!response.ok) {
        throw new Error("Failed to analyze database");
      }
      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  };

  const runCleanup = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/cleanup", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cleanup database");
      }

      const data = await response.json();
      setResult(data);
      await fetchAnalysis(); // Refresh analysis after cleanup
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const totalSize =
    analysis &&
    analysis.scheduleEntries.size.mb +
    analysis.productivityRatings.size.mb +
    analysis.weeklyNotes.size.mb +
    analysis.monthEntries.size.mb +
    analysis.goals.size.mb +
    analysis.focusAreas.size.mb;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] bg-background p-8 text-foreground">
        <h1 className="mb-6 text-3xl font-light">Database Analysis & Cleanup</h1>

        {analyzing && (
          <div className="mb-6 rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-4 text-center">
            <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
              Analyzing database...
            </p>
          </div>
        )}

        {analysis && (
          <>
            <div className="mb-6 rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-4">
              <h2 className="mb-3 text-lg font-semibold">Database Analysis</h2>
              <p className="mb-3 text-2xl font-bold">{totalSize?.toFixed(2)} MB total</p>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] pb-2">
                  <span>Schedule Entries</span>
                  <span>{analysis.scheduleEntries.total} items ({analysis.scheduleEntries.size.kb} KB)</span>
                </div>
                <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] pb-2">
                  <span>Productivity Ratings</span>
                  <span>{analysis.productivityRatings.total} items ({analysis.productivityRatings.size.kb} KB)</span>
                </div>
                <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] pb-2">
                  <span>Weekly Notes</span>
                  <span>{analysis.weeklyNotes.total} items ({analysis.weeklyNotes.size.kb} KB)</span>
                </div>
                <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] pb-2">
                  <span>Month Entries</span>
                  <span>{analysis.monthEntries.total} items ({analysis.monthEntries.size.kb} KB)</span>
                </div>
                <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] pb-2">
                  <span>Goals</span>
                  <span>{analysis.goals.total} items ({analysis.goals.size.kb} KB)</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span>Focus Areas</span>
                  <span>{analysis.focusAreas.total} items ({analysis.focusAreas.size.kb} KB)</span>
                </div>
              </div>
            </div>

            {(analysis.scheduleEntries.oldEntries > 0 || analysis.productivityRatings.oldEntries > 0) && (
              <div className="mb-6 rounded-2xl border border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950">
                <p className="mb-2 font-semibold text-yellow-900 dark:text-yellow-100">
                  Found old data to clean:
                </p>
                <ul className="space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                  {analysis.scheduleEntries.oldEntries > 0 && (
                    <li>• {analysis.scheduleEntries.oldEntries} old schedule entries</li>
                  )}
                  {analysis.productivityRatings.oldEntries > 0 && (
                    <li>• {analysis.productivityRatings.oldEntries} old productivity ratings</li>
                  )}
                </ul>
              </div>
            )}

            <button
              onClick={runCleanup}
              disabled={loading || (analysis.scheduleEntries.oldEntries === 0 && analysis.productivityRatings.oldEntries === 0)}
              className="mb-4 w-full rounded-full bg-red-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Cleaning up..." : "Clean Up Old Data (90+ days)"}
            </button>
          </>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mb-4 rounded-2xl border border-green-500 bg-green-50 p-4 text-sm dark:bg-green-950">
            <p className="mb-3 font-semibold text-green-900 dark:text-green-100">
              ✓ Cleanup complete!
            </p>
            <div className="space-y-2 text-green-800 dark:text-green-200">
              <p>
                <strong>Schedule entries deleted:</strong> {result.deleted.scheduleEntries}
              </p>
              <p>
                <strong>Productivity ratings deleted:</strong> {result.deleted.productivityRatings}
              </p>
              <p>
                <strong>Cutoff date:</strong> {result.cutoffDate}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:text-foreground"
          >
            ← Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
