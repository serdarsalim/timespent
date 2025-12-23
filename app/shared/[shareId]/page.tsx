"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ProductivityGrid,
  buildWeeksForYear,
  getWeekStart,
  formatWeekKey,
  formatDayKey,
  PRODUCTIVITY_SCALE_THREE,
  PRODUCTIVITY_SCALE_FOUR,
  type ProductivityScaleEntry,
  type WeekMeta,
  type WeekdayIndex,
  type Goal,
  type KeyResult,
  type WeeklyNoteEntry,
} from "@/app/page";

type SharedWeeklyNote = {
  content: string;
  dos: string;
  donts: string;
};

type SharedGoal = {
  id: string;
  title: string;
  timeframe: string;
  statusOverride?: string | null;
  archived?: boolean;
  keyResults: { id: string; title: string; status: string }[];
};

type SharePayload = {
  share: {
    id: string;
    viewerIsOwner: boolean;
    showSelfRating: boolean;
    showDosDonts: boolean;
    showWeeklyGoals: boolean;
    showOkrs: boolean;
    owner: {
      id: string;
      email?: string | null;
      personName?: string | null;
    };
    profile: {
      weekStartDay: WeekdayIndex;
      goalsSectionTitle: string;
      productivityViewMode: "day" | "week";
      productivityScaleMode: "3" | "4";
      showLegend: boolean;
      autoMarkWeekendsOff: boolean;
      workDays: string;
    };
    goals: SharedGoal[];
    productivityRatings: Record<string, number | null>;
    dayOffs: Record<string, boolean>;
    weeklyNotes: Record<string, SharedWeeklyNote>;
  };
};

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";

// ProductivityGrid and helper functions are now imported from main page


export default function SharedPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = use(params);
  const [data, setData] = useState<SharePayload["share"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [productivityYear, setProductivityYear] = useState(() =>
    new Date().getFullYear()
  );
  const [productivityMode, setProductivityMode] = useState<"day" | "week">("week");
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadShare = async () => {
      try {
        const response = await fetch(`/api/shares/${shareId}`);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Please sign in to view this shared page.");
          }
          throw new Error("Unable to load shared page.");
        }
        const payload = (await response.json()) as SharePayload;
        if (!isMounted) return;
        setData(payload.share);
        setProductivityMode(payload.share.profile.productivityViewMode);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to load shared page.");
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };
    loadShare();
    return () => {
      isMounted = false;
    };
  }, [shareId]);

  const weeksForYear = useMemo(() => {
    if (!data) return [];
    return buildWeeksForYear(productivityYear, data.profile.weekStartDay);
  }, [data, productivityYear]);

  useEffect(() => {
    if (!data || selectedWeekKey) return;
    const today = new Date();
    const currentWeek = weeksForYear.find((week) =>
      week.dayKeys.some((dayKey) => {
        const [y, m, d] = dayKey.split("-").map(Number);
        const keyDate = new Date(y!, m! - 1, d);
        return (
          keyDate.getFullYear() === today.getFullYear() &&
          keyDate.getMonth() === today.getMonth() &&
          keyDate.getDate() === today.getDate()
        );
      })
    );
    if (currentWeek) {
      setSelectedWeekKey(currentWeek.weekKey);
    }
  }, [data, selectedWeekKey, weeksForYear]);

  // Parse workDays to determine weekends - must be before early returns
  const workDays = useMemo(() => {
    if (!data?.profile?.workDays) return [0, 1, 2, 3, 4, 5, 6];
    const parsed = data.profile.workDays
      .split(',')
      .map((d: string) => Number(d))
      .filter((d: number) => d >= 0 && d <= 6) as WeekdayIndex[];
    return parsed.length > 0 ? parsed : [0, 1, 2, 3, 4, 5, 6];
  }, [data?.profile?.workDays]);

  // Compute day-offs including auto-marked weekends - must be before early returns
  const computedDayOffs = useMemo(() => {
    if (!data?.dayOffs) return {};
    if (!data?.profile?.autoMarkWeekendsOff) {
      return data.dayOffs;
    }

    const result = { ...data.dayOffs };

    // Helper to check if a day is a weekend (not in workDays)
    const isWeekend = (yearVal: number, monthIndex: number, dayOfMonth: number): boolean => {
      const date = new Date(yearVal, monthIndex, dayOfMonth);
      const dayOfWeek = date.getDay() as WeekdayIndex;
      return !workDays.includes(dayOfWeek);
    };

    // Add all weekends from the current year range
    const years = [productivityYear - 1, productivityYear, productivityYear + 1];
    years.forEach(year => {
      for (let month = 0; month < 12; month++) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          if (isWeekend(year, month, day)) {
            const date = new Date(year, month, day);
            const key = formatDayKey(date);
            // Only add if not explicitly overridden to false
            if (result[key] === undefined) {
              result[key] = true;
            }
          }
        }
      }
    });

    return result;
  }, [data?.dayOffs, data?.profile?.autoMarkWeekendsOff, productivityYear, workDays]);

  const selectedWeekEntry = selectedWeekKey ? data?.weeklyNotes[selectedWeekKey] : null;
  const selectedWeek = selectedWeekKey
    ? weeksForYear.find((week) => week.weekKey === selectedWeekKey)
    : null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading shared page...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          {error ?? "Unable to load shared page."}
        </p>
        <Link
          href="/"
          className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-foreground transition hover:border-foreground"
        >
          Back to app
        </Link>
      </div>
    );
  }

  const scale =
    data.profile.productivityScaleMode === "4"
      ? PRODUCTIVITY_SCALE_FOUR
      : PRODUCTIVITY_SCALE_THREE;
  const showSelfRating = data.showSelfRating !== false;
  const showDosDonts = data.showDosDonts !== false;
  const showWeeklyGoals = data.showWeeklyGoals !== false;
  const showOkrs = data.showOkrs !== false;
  const showWeeklyPanel = showDosDonts || showWeeklyGoals;
  const visibleRatings = showSelfRating ? data.productivityRatings : {};
  const dosDontsPanel = showDosDonts ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 p-4 dos-card-bg">
        <span className="text-xs uppercase tracking-[0.3em] dos-label-color">Do&apos;s</span>
        <p className="text-[13px] sm:text-sm whitespace-pre-wrap textarea-text-color px-1 py-2 sm:px-2 leading-relaxed">
          {selectedWeekEntry?.dos ?? ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 p-4 donts-card-bg">
        <span className="text-xs uppercase tracking-[0.3em] donts-label-color">Don&apos;ts</span>
        <p className="text-[13px] sm:text-sm whitespace-pre-wrap textarea-text-color px-1 py-2 sm:px-2 leading-relaxed">
          {selectedWeekEntry?.donts ?? ""}
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground">
      {data.viewerIsOwner && (
        <div className="w-full border-b border-[color-mix(in_srgb,var(--foreground)_18%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-4 py-3 text-center text-[11px] uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          Preview — this is what your recipient sees
        </div>
      )}
      <main className="flex flex-1 items-start justify-center px-4">
        <div className="w-full py-6 text-center mb-50">
          <div className={`mb-6 text-sm uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] ${!showSelfRating && !showDosDonts && !showWeeklyGoals && showOkrs ? 'print-hidden' : ''}`}>
            Shared by {data.owner.personName || data.owner.email || "Account"}
          </div>
          {selectedWeek && (
            <div className={`mb-6 flex items-center justify-center gap-4 ${!showSelfRating && !showDosDonts && !showWeeklyGoals && showOkrs ? 'print-hidden' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  const currentIndex = weeksForYear.findIndex(w => w.weekKey === selectedWeekKey);
                  if (currentIndex > 0) {
                    setSelectedWeekKey(weeksForYear[currentIndex - 1]!.weekKey);
                  } else {
                    // Go to last week of previous year
                    setProductivityYear(prev => prev - 1);
                    const prevYear = productivityYear - 1;
                    const prevYearWeeks = buildWeeksForYear(prevYear, data.profile.weekStartDay);
                    if (prevYearWeeks.length > 0) {
                      setSelectedWeekKey(prevYearWeeks[prevYearWeeks.length - 1]!.weekKey);
                    }
                  }
                }}
                className="rounded-full px-2 py-1 text-sm transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:text-foreground"
                aria-label="Previous week"
              >
                ←
              </button>
              <h1 className="text-xl sm:text-2xl font-semibold uppercase tracking-[0.3em] text-foreground">
                {selectedWeek.rangeLabel}, {selectedWeek.weekStart.getFullYear()}
              </h1>
              <button
                type="button"
                onClick={() => {
                  const currentIndex = weeksForYear.findIndex(w => w.weekKey === selectedWeekKey);
                  if (currentIndex < weeksForYear.length - 1) {
                    setSelectedWeekKey(weeksForYear[currentIndex + 1]!.weekKey);
                  } else {
                    // Go to first week of next year
                    setProductivityYear(prev => prev + 1);
                    const nextYear = productivityYear + 1;
                    const nextYearWeeks = buildWeeksForYear(nextYear, data.profile.weekStartDay);
                    if (nextYearWeeks.length > 0) {
                      setSelectedWeekKey(nextYearWeeks[0]!.weekKey);
                    }
                  }
                }}
                className="rounded-full px-2 py-1 text-sm transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:text-foreground"
                aria-label="Next week"
              >
                →
              </button>
            </div>
          )}
          <section
            className={`mx-auto grid max-w-480 gap-8 text-left ${
              showWeeklyPanel ? "lg:grid-cols-[1fr_1.2fr]" : "lg:grid-cols-1"
            }`}
          >
            <div className="space-y-4 order-2 lg:order-1">
              <ProductivityGrid
                year={productivityYear}
                setYear={setProductivityYear}
                ratings={visibleRatings}
                dayOffs={computedDayOffs}
                scale={scale}
                mode={productivityMode}
                showLegend={showSelfRating}
                selectedWeekKey={selectedWeekKey}
                setSelectedWeekKey={setSelectedWeekKey}
                weekStartDay={data.profile.weekStartDay}
                onToggleMode={() =>
                  setProductivityMode((prev) => (prev === "day" ? "week" : "day"))
                }
                readOnly={true}
              />
              {productivityMode === "week" && dosDontsPanel ? (
                <div className="mt-4 hidden lg:block">{dosDontsPanel}</div>
              ) : null}
            </div>
            {showWeeklyPanel ? (
              <div className="flex flex-col rounded-3xl px-4 pb-4 pt-0 order-1 lg:order-2">
                {productivityMode === "day" && dosDontsPanel ? (
                  <div className="mb-4">{dosDontsPanel}</div>
                ) : null}
                {productivityMode === "week" && dosDontsPanel ? (
                  <div className="mb-4 lg:hidden">{dosDontsPanel}</div>
                ) : null}
                {showWeeklyGoals ? (
                  <div className="flex-1 px-4 pt-4 pb-4 weekly-goals-bg">
                    <span className="block text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Weekly goals
                    </span>
                    <TinyEditor
                      key={selectedWeekKey ? `shared-week-notes-${selectedWeekKey}` : "shared-week-notes"}
                      tinymceScriptSrc={TINYMCE_CDN}
                      value={selectedWeekEntry?.content ?? ""}
                      init={
                        {
                          menubar: false,
                          statusbar: false,
                          height: 430,
                          license_key: "gpl",
                      plugins: "lists autoresize",
                      readonly: true,
                      skin: "oxide",
                      content_css: false,
                      toolbar: false,
                      autoresize_bottom_margin: 8,
                      min_height: 260,
                          quickbars_selection_toolbar: false,
                          quickbars_insert_toolbar: false,
                          content_style: `
                            body {
                              background-color: #faf7f4 !important;
                              color: #0f172a !important;
                              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                              font-size: 15px;
                              padding: 10px 10px 10px 22px;
                              margin: 0;
                            }
                            .mce-content-body {
                              padding-left: 22px !important;
                            }
                            .mce-content-body:before {
                              left: 22px !important;
                            }
                            @media (min-width: 640px) {
                              body {
                                padding: 10px 25px;
                              }
                            }
                            * {
                              background-color: transparent !important;
                            }
                          `,
                          branding: false,
                        } as Record<string, unknown>
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
          {showOkrs ? (
            <section className="mx-auto mt-12 max-w-5xl text-left">
              <h2 className="text-sm uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                {data.profile.goalsSectionTitle || "Goals"}
              </h2>
              <div className="mt-4 grid gap-4">
                {data.goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-white/70 p-4 shadow-[0_20px_40px_color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-foreground">{goal.title}</p>
                      </div>
                      {goal.archived ? (
                        <span className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {goal.keyResults.map((kr) => (
                        <div
                          key={kr.id}
                          className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm text-foreground"
                        >
                          <span>{kr.title}</span>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
                            {kr.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
