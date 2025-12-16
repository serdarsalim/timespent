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

type ViewMode = "life" | "time-spent";

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";

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
      <header className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-6 py-4 text-sm">
        <nav className="flex gap-3 text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          <button
            type="button"
            onClick={() => setView("life")}
            className={`rounded-full border px-5 py-2 transition ${
              view === "life"
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-[color-mix(in_srgb,var(--foreground)_25%,transparent)]"
            }`}
          >
            My life
          </button>
          <button
            type="button"
            onClick={() => setView("time-spent")}
            className={`rounded-full border px-5 py-2 transition ${
              view === "time-spent"
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-[color-mix(in_srgb,var(--foreground)_25%,transparent)]"
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
        <div className="w-full max-w-4xl py-6 text-center">
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

      <footer className="border-t border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-6 py-4 text-sm">
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
                  ? "bg-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                  : isLived
                    ? "bg-[color-mix(in_srgb,var(--foreground)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
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
