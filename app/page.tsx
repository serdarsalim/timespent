"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type FocusArea = {
  id: string;
  name: string;
  hours: string;
};

const defaultFocusAreas: FocusArea[] = [
  { id: "sleep", name: "Sleep", hours: "8" },
  { id: "eating", name: "Eating", hours: "2" },
  { id: "body", name: "Body functions", hours: "1" },
  { id: "work", name: "Work", hours: "8" },
];

const determineTheme = (): Theme => {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
};

type ViewMode = "life" | "time-spent" | "productivity";

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";
const PRODUCTIVITY_SCALE = [
  { value: 0, label: "<25%", color: "bg-[#fefae6]" },
  { value: 1, label: "25-50%", color: "bg-[#d9f0a3]" },
  { value: 2, label: "50-75%", color: "bg-[#a6d96a]" },
  { value: 3, label: ">75%", color: "bg-[#66bd63]" },
];

type WeekMeta = {
  weekNumber: number;
  months: number[];
  dayKeys: string[];
  primaryMonth: number;
  rangeLabel: string;
};

const getWeekStart = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const formatRangeLabel = (start: Date, end: Date) => {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = `${start.toLocaleString(undefined, {
    month: "short",
  })} ${start.getDate()}`;
  const endLabel = `${end.toLocaleString(undefined, {
    month: "short",
  })} ${end.getDate()}`;
  return sameMonth ? `${startLabel}–${end.getDate()}` : `${startLabel} – ${endLabel}`;
};

const buildWeeksForYear = (year: number): WeekMeta[] => {
  const weeks: WeekMeta[] = [];
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  let currentStart = getWeekStart(yearStart);
  let weekCounter = 1;

  while (currentStart <= yearEnd) {
    const weekStart = new Date(currentStart);
    const dayKeys: string[] = [];
    const monthSet = new Set<number>();
    const inYearDays: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      if (day.getFullYear() !== year) {
        continue;
      }
      const monthIndex = day.getMonth();
      monthSet.add(monthIndex);
      dayKeys.push(`${year}-${monthIndex + 1}-${day.getDate()}`);
      inYearDays.push(new Date(day));
    }

    if (dayKeys.length > 0) {
      const monthCounts: Record<number, number> = {};
      dayKeys.forEach((key) => {
        const [, monthPart] = key.split("-");
        const monthIndex = Number(monthPart) - 1;
        if (!Number.isFinite(monthIndex)) {
          return;
        }
        monthCounts[monthIndex] = (monthCounts[monthIndex] ?? 0) + 1;
      });
      const primaryMonth =
        Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const rangeLabel =
        inYearDays.length > 0
          ? formatRangeLabel(inYearDays[0]!, inYearDays[inYearDays.length - 1]!)
          : "";
      weeks.push({
        weekNumber: weekCounter,
        months: Array.from(monthSet.values()).sort((a, b) => a - b),
        dayKeys,
        primaryMonth: Number(primaryMonth),
        rangeLabel,
      });
      weekCounter += 1;
    }

    currentStart = new Date(weekStart);
    currentStart.setDate(weekStart.getDate() + 7);
  }

  return weeks;
};

export default function Home() {
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [personName, setPersonName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [isEditingProfile, setIsEditingProfile] = useState(true);
  const [theme, setTheme] = useState<Theme>("light");
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(defaultFocusAreas);
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [recentYears, setRecentYears] = useState<string>("10");
  const [view, setView] = useState<ViewMode>("life");
  const [monthEntries, setMonthEntries] = useState<Record<string, string>>({});
  const [selectedMonth, setSelectedMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [productivityYear, setProductivityYear] = useState(() =>
    new Date().getFullYear()
  );
  const [productivityRatings, setProductivityRatings] = useState<
    Record<string, number | null>
  >({});
  const [productivityGoals, setProductivityGoals] = useState<
    Record<number, string>
  >({});
  const [productivityMode, setProductivityMode] =
    useState<"day" | "week">("day");

  useEffect(() => {
    const autoTheme = determineTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme((current) => (current === autoTheme ? current : autoTheme));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const storedProfile = window.localStorage.getItem("timespent-profile");
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile) as {
          name?: string;
          dateOfBirth?: string;
          email?: string;
        };
        if (parsed.name) {
          setPersonName(parsed.name);
        }
        if (parsed.dateOfBirth) {
          setDateOfBirth(parsed.dateOfBirth);
        }
        if (parsed.email) {
          setEmail(parsed.email);
        }
        const complete =
          Boolean(parsed.name) && Boolean(parsed.dateOfBirth) && Boolean(parsed.email);
        setIsEditingProfile(!complete);
      }

      const storedFocus = window.localStorage.getItem("timespent-focus-areas");
      if (storedFocus) {
        const parsedFocus = JSON.parse(storedFocus) as FocusArea[];
        if (Array.isArray(parsedFocus) && parsedFocus.length > 0) {
          setFocusAreas(parsedFocus);
        }
      }

      const storedEntries = window.localStorage.getItem(
        "timespent-life-entries"
      );
      if (storedEntries) {
        const parsedEntries = JSON.parse(storedEntries) as Record<
          string,
          string
        >;
        if (parsedEntries && typeof parsedEntries === "object") {
          setMonthEntries(parsedEntries);
        }
      }

      const storedProductivityRatings = window.localStorage.getItem(
        "timespent-productivity-ratings"
      );
      if (storedProductivityRatings) {
        const parsedRatings = JSON.parse(
          storedProductivityRatings
        ) as Record<string, number | null>;
        if (parsedRatings && typeof parsedRatings === "object") {
          setProductivityRatings(parsedRatings);
        }
      }

      const storedProductivityGoal = window.localStorage.getItem(
        "timespent-productivity-goals"
      );
      if (storedProductivityGoal) {
        const parsedGoals = JSON.parse(storedProductivityGoal) as Record<
          number,
          string
        >;
        if (parsedGoals && typeof parsedGoals === "object") {
          setProductivityGoals(parsedGoals);
        }
      }
      const storedView =
        window.localStorage.getItem("timespent-active-view");
      if (storedView === "life" || storedView === "time-spent" || storedView === "productivity") {
        setView(storedView);
      }
    } catch (error) {
      console.error("Failed to load settings from cache", error);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "timespent-profile",
        JSON.stringify({
          name: personName,
          dateOfBirth,
          email,
        })
      );
    } catch (error) {
      console.error("Failed to cache profile", error);
    }
  }, [personName, dateOfBirth, email]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "timespent-focus-areas",
        JSON.stringify(focusAreas)
      );
    } catch (error) {
      console.error("Failed to cache focus areas", error);
    }
  }, [focusAreas]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "timespent-life-entries",
        JSON.stringify(monthEntries)
      );
    } catch (error) {
      console.error("Failed to cache month entries", error);
    }
  }, [monthEntries]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "timespent-productivity-ratings",
        JSON.stringify(productivityRatings)
      );
    } catch (error) {
      console.error("Failed to cache productivity ratings", error);
    }
  }, [productivityRatings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "timespent-productivity-goals",
        JSON.stringify(productivityGoals)
      );
    } catch (error) {
      console.error("Failed to cache productivity goals", error);
    }
  }, [productivityGoals]);


  const isProfileComplete = Boolean(personName && dateOfBirth && email);
  const isProfileEditorVisible = isEditingProfile || !isProfileComplete;

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const toggleFocusEditor = () => {
    setIsEditingFocus((prev) => !prev);
  };

  const updateFocusArea = (
    id: string,
    field: "name" | "hours",
    value: string
  ) => {
    setFocusAreas((areas) =>
      areas.map((area) =>
        area.id === id ? { ...area, [field]: value } : area
      )
    );
  };

  const addFocusArea = () => {
    setFocusAreas((areas) => [
      ...areas,
      {
        id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "New focus",
        hours: "1",
      },
    ]);
  };

  const { monthsLived, hasValidBirthdate } = useMemo(() => {
    if (!dateOfBirth) {
      return { monthsLived: 0, hasValidBirthdate: false };
    }

    const dob = new Date(dateOfBirth);
    const now = new Date();

    if (Number.isNaN(dob.getTime()) || dob > now) {
      return { monthsLived: 0, hasValidBirthdate: false };
    }

    let months =
      (now.getFullYear() - dob.getFullYear()) * 12 +
      (now.getMonth() - dob.getMonth());

    if (now.getDate() < dob.getDate()) {
      months -= 1;
    }

    const clampedMonths = Math.max(0, Math.min(months, 90 * 12));
    return { monthsLived: clampedMonths, hasValidBirthdate: true };
  }, [dateOfBirth]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (view !== "life" && selectedMonth) {
      setSelectedMonth(null);
    }
  }, [view, selectedMonth]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleMonthSelect = (year: number, month: number) => {
    setSelectedMonth({ year, month });
  };

  const monthKey = (year: number, month: number) => `${year}-${month}`;

  const selectedMonthKey = selectedMonth
    ? monthKey(selectedMonth.year, selectedMonth.month)
    : null;
  const selectedMonthContent = selectedMonthKey
    ? monthEntries[selectedMonthKey] ?? ""
    : "";
  const currentProductivityGoal = useMemo(() => {
    return productivityGoals[productivityYear] ?? "";
  }, [productivityGoals, productivityYear]);

  const selectedMonthLabel = useMemo(() => {
    if (!selectedMonth || !dateOfBirth) {
      return null;
    }
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return null;
    }
    const monthDate = new Date(dob);
    monthDate.setMonth(
      dob.getMonth() + (selectedMonth.year - 1) * 12 + (selectedMonth.month - 1)
    );
    return monthDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }, [selectedMonth, dateOfBirth]);

  const selectedMonthAge = useMemo(() => {
    if (!selectedMonth || !dateOfBirth) {
      return null;
    }
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return null;
    }
    const monthDate = new Date(dob);
    monthDate.setMonth(
      dob.getMonth() + (selectedMonth.year - 1) * 12 + (selectedMonth.month - 1)
    );
    let years = monthDate.getFullYear() - dob.getFullYear();
    let months = monthDate.getMonth() - dob.getMonth();
    if (monthDate.getDate() < dob.getDate()) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    years = Math.max(years, 0);
    months = Math.max(months, 0);
    return { years, months };
  }, [selectedMonth, dateOfBirth]);

  const handleEntryChange = (content: string) => {
    if (!selectedMonthKey) {
      return;
    }
    setMonthEntries((prev) => {
      const updated = { ...prev };
      if (!content.trim()) {
        delete updated[selectedMonthKey];
      } else {
        updated[selectedMonthKey] = content;
      }
      return updated;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] transition-colors">
      <header className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-4 py-2 text-sm">
        <nav className="flex gap-2 text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          <button
            type="button"
            onClick={() => setView("life")}
            className={`rounded-full px-4 py-1 transition ${
              view === "life"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-[var(--foreground)]"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            My life
          </button>
          <button
            type="button"
            onClick={() => setView("productivity")}
            className={`rounded-full px-4 py-1 transition ${
              view === "productivity"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-[var(--foreground)]"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            Productivity
          </button>
          <button
            type="button"
            onClick={() => setView("time-spent")}
            className={`rounded-full px-4 py-1 transition ${
              view === "time-spent"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-[var(--foreground)]"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            Time spent
          </button>
        </nav>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!isProfileComplete) {
                setIsEditingProfile(true);
                return;
              }
              setIsEditingProfile((prev) => !prev);
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              isProfileEditorVisible
                ? "bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
                : "hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
            }`}
            aria-label="Toggle profile settings"
            aria-pressed={isProfileEditorVisible}
          >
            ⚙️
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center rounded-full p-2 text-lg transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
            aria-label="Toggle dark mode"
          >
            <span role="img" aria-hidden="true">
              {theme === "light" ? "🌙" : "☀️"}
            </span>
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4">
        <div className="w-full max-w-5xl py-2 text-center">
          {view === "life" && (
            <section className="mt-4 space-y-4">
              {isProfileComplete && (
                <p className="text-2xl font-light leading-tight sm:text-4xl">
                  {personName.trim()}
                  {"'"}s journey
                </p>
              )}

              {isProfileEditorVisible && (
                <div className="mx-auto max-w-2xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] p-6 text-left">
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
                      Profile
                    </p>
                    <p className="text-2xl font-light text-[var(--foreground)]">
                      {personName || "Your name"}
                    </p>
                  </div>
                  <dl className="space-y-3 text-sm text-[color-mix(in_srgb,var(--foreground)_75%,transparent)]">
                    <div className="flex justify-between">
                      <dt>Name</dt>
                      <dd>{personName || "Not set"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Date of birth</dt>
                      <dd>
                        {dateOfBirth
                          ? new Date(dateOfBirth).toLocaleDateString()
                          : "Not set"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Email</dt>
                      <dd>{email || "Not set"}</dd>
                    </div>
                  </dl>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col text-xs uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Name
                      <input
                        type="text"
                        value={personName}
                        onChange={(event) =>
                          setPersonName(event.target.value.slice(0, 32))
                        }
                        className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] bg-transparent px-4 py-2 text-base font-light text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                        placeholder="Your name"
                      />
                    </label>
                    <label className="flex flex-col text-xs uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Date of birth
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(event) => setDateOfBirth(event.target.value)}
                        className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] bg-transparent px-4 py-2 text-base font-light text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                      />
                    </label>
                    <label className="flex flex-col text-xs uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Email
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] bg-transparent px-4 py-2 text-base font-light text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                        placeholder="name@email.com"
                      />
                    </label>
                  </div>
                </div>
              )}

              {hasValidBirthdate && (
                <div className="mt-4 flex justify-center">
                  <AgeGrid
                    totalMonthsLived={monthsLived}
                    maxYears={90}
                    onSelectMonth={handleMonthSelect}
                    selectedMonth={selectedMonth}
                    entries={monthEntries}
                  />
                </div>
              )}

            </section>
          )}

          {view === "time-spent" && (
            <section className="mt-12">
              <p className="text-3xl font-light leading-tight sm:text-4xl">
                How I spent the last{" "}
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={recentYears}
                  onChange={(event) =>
                    setRecentYears(event.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="mx-3 w-24 border-b border-[color-mix(in_srgb,var(--foreground)_60%,transparent)] bg-transparent text-center text-4xl font-semibold text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                  aria-label="Enter the number of years to analyze"
                />{" "}
                years of my life
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-base">
                {focusAreas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-5 py-2 text-sm uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-[var(--foreground)]"
                  >
                    {area.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={toggleFocusEditor}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-xl text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-[var(--foreground)]"
                  aria-label="Configure focus areas"
                >
                  ⚙️
                </button>
              </div>

              {isEditingFocus && (
                <div className="mx-auto mt-6 max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)] p-6 text-left backdrop-blur">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm uppercase tracking-[0.25em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                      Daily breakdown
                    </p>
                    <button
                      type="button"
                      onClick={addFocusArea}
                      className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                    >
                      + Add pill
                    </button>
                  </div>
                  <div className="space-y-3">
                    {focusAreas.map((area) => (
                      <div
                        key={`editor-${area.id}`}
                        className="flex flex-wrap gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] px-4 py-3"
                      >
                        <label className="flex min-w-[140px] flex-1 flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                          Name
                          <input
                            type="text"
                            value={area.name}
                            onChange={(event) =>
                              updateFocusArea(area.id, "name", event.target.value)
                            }
                            className="mt-1 border-b border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] bg-transparent py-1 text-base font-light text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                          />
                        </label>
                        <label className="flex w-32 flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                          Hours / day
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={area.hours}
                            onChange={(event) =>
                              updateFocusArea(area.id, "hours", event.target.value)
                            }
                            className="mt-1 border-b border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] bg-transparent py-1 text-base font-light text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {view === "productivity" && (
            <section className="mt-8 grid gap-8 text-left lg:grid-cols-[1.2fr_1fr]">
              <div className="flex flex-col rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] p-6">
                <div className="mb-6 flex flex-wrap items-center justify-center gap-3 text-3xl font-light">
                  <input
                    type="number"
                    value={productivityYear}
                    onChange={(event) =>
                      setProductivityYear(
                        Number.parseInt(event.target.value, 10) || 0
                      )
                    }
                    className="w-28 border-b border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] bg-transparent px-3 text-3xl text-[var(--foreground)] outline-none focus:border-[var(--foreground)] caret-[var(--foreground)] text-center"
                  />
                  <span>Productivity tracker</span>
                </div>
                <div className="mb-6">
                  <ProductivityLegend />
                </div>
                <div className="flex-1">
                  <TinyEditor
                    key={`productivity-goal-${productivityYear}`}
                    tinymceScriptSrc={TINYMCE_CDN}
                    value={currentProductivityGoal}
                    init={{
                      menubar: false,
                      statusbar: false,
                      height: 420,
                      license_key: "gpl",
                    plugins: "lists",
                      skin: theme === "dark" ? "oxide-dark" : "oxide",
                      content_css: theme === "dark" ? "dark" : "default",
                    toolbar: "bold italic underline | bullist numlist | link removeformat",
                      branding: false,
                    }}
                    onEditorChange={(content) =>
                      setProductivityGoals((prev) => ({
                        ...prev,
                        [productivityYear]: content,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-6">
                <ProductivityGrid
                  year={productivityYear}
                  ratings={productivityRatings}
                  setRatings={setProductivityRatings}
                  mode={productivityMode}
                  onToggleMode={() =>
                    setProductivityMode((prev) => (prev === "day" ? "week" : "day"))
                  }
                />
              </div>
            </section>
          )}
        </div>
      </main>

      {selectedMonth && hasValidBirthdate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setSelectedMonth(null)}
        >
          <div className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[var(--background)] p-6 text-left shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
                  Month journal
                </p>
                <p className="text-xl font-light text-[var(--foreground)]">
                  {selectedMonthLabel ??
                    `Year ${selectedMonth.year}, month ${selectedMonth.month}`}
                  {selectedMonthAge && (
                    <span className="ml-2 text-base text-[color-mix(in_srgb,var(--foreground)_65%,transparent)]">
                      • Age {selectedMonthAge.years}y {selectedMonthAge.months}m
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
              >
                ✕
              </button>
            </div>
            <TinyEditor
              key={selectedMonthKey ?? "editor"}
              tinymceScriptSrc={TINYMCE_CDN}
              value={selectedMonthContent}
              init={{
                menubar: false,
                statusbar: false,
                height: 320,
                license_key: "gpl",
                skin: theme === "dark" ? "oxide-dark" : "oxide",
                content_css: theme === "dark" ? "dark" : "default",
                toolbar:
                  "bold italic underline | bullist numlist | link removeformat",
                branding: false,
              }}
              onEditorChange={handleEntryChange}
            />
          </div>
        </div>
      )}

      <footer className="mt-24 border-t border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-6 py-4 text-sm">
        <p>TimeSpent</p>
      </footer>
    </div>
  );
}

type AgeGridProps = {
  totalMonthsLived: number;
  maxYears: number;
  onSelectMonth: (year: number, month: number) => void;
  selectedMonth: { year: number; month: number } | null;
  entries: Record<string, string>;
};

const AgeGrid = ({
  totalMonthsLived,
  maxYears,
  onSelectMonth,
  selectedMonth,
  entries,
}: AgeGridProps) => {
  const totalYears = maxYears;
  const clampedMonths = Math.max(
    0,
    Math.min(totalMonthsLived, totalYears * 12)
  );
  const decades = Array.from(
    { length: Math.ceil(totalYears / 10) },
    (_, idx) => idx
  );

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {decades.map((decadeIndex) => {
        const startYear = decadeIndex * 10 + 1;
        const endYear = Math.min(startYear + 9, totalYears);
        const years = Array.from(
          { length: endYear - startYear + 1 },
          (_, idx) => startYear + idx
        );

        return (
          <section key={`decade-${startYear}`} className="space-y-1.5">
            <p className="text-left text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
              {startYear}-{endYear} yrs
            </p>
            <div className="space-y-2">
              {years.map((yearNumber) => (
                <YearRow
                  key={`year-${yearNumber}`}
                  yearNumber={yearNumber}
                  yearIndex={yearNumber - 1}
                  totalMonthsLived={clampedMonths}
                  onSelectMonth={onSelectMonth}
                  selectedMonth={selectedMonth}
                  entries={entries}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const YearRow = ({
  yearNumber,
  yearIndex,
  totalMonthsLived,
  onSelectMonth,
  selectedMonth,
  entries,
}: {
  yearNumber: number;
  yearIndex: number;
  totalMonthsLived: number;
  onSelectMonth: (year: number, month: number) => void;
  selectedMonth: { year: number; month: number } | null;
  entries: Record<string, string>;
}) => {
  const months = Array.from({ length: 12 }, (_, idx) => idx);

  return (
    <div className="grid grid-cols-12 gap-px">
      {months.map((monthIndex) => {
        const displayMonth = monthIndex + 1;
        const key = `${yearNumber}-${displayMonth}`;
        const hasEntry = Boolean(entries[key]?.trim());
        const isSelected =
          selectedMonth?.year === yearNumber &&
          selectedMonth?.month === displayMonth;
        const monthsBeforeCell = yearIndex * 12 + displayMonth;
        const isLived = monthsBeforeCell <= totalMonthsLived;
        const baseClasses =
          "h-3 w-3 rounded-[2px] transition sm:h-4 sm:w-4 focus:outline-none";

        return (
          <button
            type="button"
            key={key}
            onClick={() => onSelectMonth(yearNumber, displayMonth)}
            className={`${baseClasses} ${
              isSelected
                ? "bg-[var(--foreground)] ring-2 ring-[color-mix(in_srgb,var(--foreground)_40%,transparent)]"
                : hasEntry
                  ? "bg-[#f6ad55] hover:bg-[#f28c28]"
                  : isLived
                    ? "bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_65%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] opacity-70 hover:opacity-100"
            }`}
            aria-label={`Year ${yearNumber}, month ${displayMonth}`}
            aria-pressed={isSelected}
            title={
              hasEntry
                ? "Contains notes. Click to view or edit."
                : "Click to add notes."
            }
          />
        );
      })}
    </div>
  );
};

type ProductivityLegendProps = {
  className?: string;
};

const ProductivityLegend = ({ className }: ProductivityLegendProps = {}) => (
  <div
    className={`flex flex-wrap gap-3 rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-4 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:flex-nowrap ${className ?? ""}`}
  >
    {PRODUCTIVITY_SCALE.map((scale) => (
      <div key={scale.value} className="flex items-center gap-2 whitespace-nowrap">
        <span
          className={`h-4 w-4 rounded ${scale.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)]`}
          aria-hidden="true"
        />
        <span>{scale.value}</span>
        <span>{scale.label}</span>
      </div>
    ))}
  </div>
);

type ProductivityGridProps = {
  year: number;
  ratings: Record<string, number | null>;
  setRatings: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  mode: "day" | "week";
  onToggleMode: () => void;
};

const ProductivityGrid = ({
  year,
  ratings,
  setRatings,
  mode,
  onToggleMode,
}: ProductivityGridProps) => {
  const days = Array.from({ length: 31 }, (_, idx) => idx + 1);
  const months = Array.from({ length: 12 }, (_, idx) => idx);
  const weeks = useMemo(() => buildWeeksForYear(year), [year]);
  const weeksByMonth = useMemo(() => {
    const grouped = Array.from({ length: 12 }, () => [] as WeekMeta[]);
    weeks.forEach((week) => {
      const bucket = Math.min(Math.max(week.primaryMonth, 0), 11);
      grouped[bucket]!.push(week);
    });
    return grouped.map((monthWeeks) =>
      monthWeeks.sort((a, b) => a.weekNumber - b.weekNumber)
    );
  }, [weeks]);
  const toggleLabel = mode === "week" ? "Week" : "Day";
  const dayColumnWidth = "minmax(44px,max-content)";
  const toggleButton = (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onToggleMode}
        className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[9px] uppercase text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-[var(--foreground)]"
        aria-label={`Switch to ${mode === "week" ? "day" : "week"} view`}
      >
        {toggleLabel}
      </button>
    </div>
  );

  const handleCycle = (monthIndex: number, day: number) => {
    const key = `${year}-${monthIndex + 1}-${day}`;
    setRatings((prev) => {
      const current = prev[key];
      let next: number | null;
      if (current === undefined || current === null) {
        next = 0;
      } else if (current >= PRODUCTIVITY_SCALE.length - 1) {
        next = null;
      } else {
        next = (current + 1) as number;
      }

      return { ...prev, [key]: next };
    });
  };

  const handleWeekCycle = (weekNumber: number) => {
    const key = `week-${year}-${weekNumber}`;
    setRatings((prev) => {
      const current = prev[key];
      let next: number | null;
      if (current === undefined || current === null) {
        next = 0;
      } else if (current >= PRODUCTIVITY_SCALE.length - 1) {
        next = null;
      } else {
        next = (current + 1) as number;
      }

      return { ...prev, [key]: next };
    });
  };

  const daysInMonth = (targetYear: number, monthIndex: number) => {
    return new Date(targetYear, monthIndex + 1, 0).getDate();
  };

  const renderDayGrid = () => (
    <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6">
      <div
        className="grid gap-2 text-xs text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
        style={{
          gridTemplateColumns: `${dayColumnWidth} repeat(12, minmax(0, 1fr))`,
        }}
      >
        {toggleButton}
        {months.map((monthIndex) => {
          const monthName = new Date(2020, monthIndex).toLocaleString(undefined, {
            month: "short",
          });
          const quarterColor =
            Math.floor(monthIndex / 3) % 2 === 0
              ? "text-[#5B8FF9]"
              : "text-[#F6BD16]";
          return (
            <span key={`month-${monthIndex}`} className={`text-center font-medium ${quarterColor}`}>
              {monthName}
            </span>
          );
        })}
      </div>
      <div className="mt-2 space-y-1">
        {days.map((dayOfMonth) => (
          <div
            key={`row-${dayOfMonth}`}
            className="grid items-center gap-2"
            style={{
              gridTemplateColumns: `${dayColumnWidth} repeat(12, minmax(0, 1fr))`,
            }}
          >
            <span className="text-right text-xs text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
              {dayOfMonth}
            </span>
            {months.map((monthIndex) => {
              const key = `${year}-${monthIndex + 1}-${dayOfMonth}`;
              const storedValue = ratings[key];
              const hasValue =
                storedValue !== null && storedValue !== undefined;
              const currentValue = hasValue ? storedValue! : 0;
              const scale = PRODUCTIVITY_SCALE[currentValue];
              const validDay =
                dayOfMonth <= daysInMonth(year, monthIndex);

              if (!validDay) {
                return (
                  <span
                    key={`${key}-empty`}
                    className="h-4 w-full rounded-[4px] border border-dashed border-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                    aria-hidden="true"
                  />
                );
              }

              const today = new Date();
              const isToday =
                today.getFullYear() === year &&
                today.getMonth() === monthIndex &&
                today.getDate() === dayOfMonth;

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleCycle(monthIndex, dayOfMonth)}
                  className={`h-4 w-full rounded-[4px] border text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] ${
                    hasValue
                      ? scale.color
                      : "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                  } ${
                    isToday
                      ? "border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] shadow-[0_0_10px_rgba(0,0,0,0.2)]"
                      : "border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"
                  }`}
                  aria-label={`Day ${dayOfMonth} of ${new Date(2020, monthIndex).toLocaleString(undefined, {
                    month: "long",
                  })}, rating ${scale.label}`}
                >
                  {hasValue ? currentValue : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const renderWeekGrid = () => {
    return (
      <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6">
        <div
          className="grid gap-2 text-xs text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
          style={{
            gridTemplateColumns: `${dayColumnWidth} repeat(12, minmax(0, 1fr))`,
          }}
        >
          {toggleButton}
          {months.map((monthIndex) => {
            const monthName = new Date(2020, monthIndex).toLocaleString(undefined, {
              month: "short",
            });
            const quarterColor =
              Math.floor(monthIndex / 3) % 2 === 0
                ? "text-[#5B8FF9]"
                : "text-[#F6BD16]";
            return (
              <span key={`week-month-${monthIndex}`} className={`text-center font-medium ${quarterColor}`}>
                {monthName}
              </span>
            );
          })}
        </div>
        <div
          className="mt-4 grid gap-3"
          style={{
            gridTemplateColumns: `${dayColumnWidth} repeat(12, minmax(0, 1fr))`,
          }}
        >
          <div aria-hidden="true" />
          {months.map((monthIndex) => (
            <div key={`month-col-${monthIndex}`} className="space-y-2">
              {weeksByMonth[monthIndex]!.map((week) => {
                const dayScores = week.dayKeys
                  .map((key) =>
                    ratings[key] !== null && ratings[key] !== undefined
                      ? (ratings[key] as number)
                      : null
                  )
                  .filter((value): value is number => value !== null);
                const hasDayScores = dayScores.length > 0;
                const dayAverage = hasDayScores
                  ? Number(
                      (
                        dayScores.reduce((sum, value) => sum + value, 0) /
                        dayScores.length
                      ).toFixed(1)
                    )
                  : null;
                const manualWeekKey = `week-${year}-${week.weekNumber}`;
                const manualScoreRaw = ratings[manualWeekKey];
                const manualScore =
                  manualScoreRaw !== null && manualScoreRaw !== undefined
                    ? (manualScoreRaw as number)
                    : null;
                const displayValue = hasDayScores
                  ? dayAverage
                  : manualScore ?? "";
                const colorIndex = hasDayScores
                  ? Math.max(
                      0,
                      Math.min(
                        PRODUCTIVITY_SCALE.length - 1,
                        Math.round(dayAverage ?? 0)
                      )
                    )
                  : manualScore;
                const scaleClass =
                  colorIndex !== null && colorIndex !== undefined
                    ? PRODUCTIVITY_SCALE[colorIndex].color
                    : "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]";
                return (
                  <div key={`week-card-${week.weekNumber}`}>
                    <button
                      type="button"
                      onClick={() => handleWeekCycle(week.weekNumber)}
                      disabled={hasDayScores}
                      className={`h-4 w-full rounded-[4px] border text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] ${
                        hasDayScores
                          ? "cursor-not-allowed opacity-80"
                          : "hover:opacity-90"
                      } ${scaleClass} border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]`}
                      title={`${week.rangeLabel}`}
                      aria-label={
                        hasDayScores
                          ? `Week ${week.weekNumber} ${week.rangeLabel}, averaged score ${dayAverage}`
                          : `Week ${week.weekNumber} ${week.rangeLabel}, current score ${manualScore ?? "unset"}`
                      }
                    >
                      {displayValue}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return mode === "day" ? renderDayGrid() : renderWeekGrid();
};
