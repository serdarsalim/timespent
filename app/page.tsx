"use client";

import { useEffect, useState, type ChangeEvent } from "react";

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

export default function Home() {
  const [age, setAge] = useState<string>("30");
  const [theme, setTheme] = useState<Theme>("light");
  const [showGrid, setShowGrid] = useState(false);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(defaultFocusAreas);
  const [isEditingFocus, setIsEditingFocus] = useState(false);

  useEffect(() => {
    const autoTheme = determineTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme((current) => (current === autoTheme ? current : autoTheme));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const handleAgeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAge(event.target.value.replace(/[^0-9]/g, "").slice(0, 3));
  };

  const parsedAge = Number.parseInt(age, 10);
  const resolvedAge = Number.isNaN(parsedAge)
    ? 0
    : Math.min(Math.max(parsedAge, 0), 90);

  const handleSubmit = () => {
    if (resolvedAge > 0) {
      setShowGrid(true);
    }
  };

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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] transition-colors">
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-3xl py-20 text-center">
          <div className="inline-flex items-center gap-4 text-4xl font-extralight leading-tight sm:text-5xl">
            <p>
              I am{" "}
              <input
                type="text"
                inputMode="numeric"
              pattern="[0-9]*"
              value={age}
              onChange={handleAgeChange}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              className="mx-3 w-24 border-b border-[color-mix(in_srgb,var(--foreground)_60%,transparent)] bg-transparent text-center text-5xl font-semibold tracking-tight text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
              aria-label="Enter your age"
            />{" "}
            years old.
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] px-5 py-2 text-2xl font-medium text-[var(--foreground)] transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
              aria-label="Confirm age"
            >
              ↵
            </button>
          </div>

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
                    <label className="flex flex-1 min-w-[140px] flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
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

          {showGrid && resolvedAge > 0 && (
            <div className="mt-12 flex justify-center">
              <AgeGrid age={resolvedAge} maxAge={90} />
            </div>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-6 py-4 text-sm">
        <p>TimeSpent</p>
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
      </footer>
    </div>
  );
}

type AgeGridProps = {
  age: number;
  maxAge: number;
};

const AgeGrid = ({ age, maxAge }: AgeGridProps) => {
  if (age <= 0) {
    return null;
  }

  const clampedAge = Math.min(age, maxAge);
  const decades = Array.from(
    { length: Math.ceil(clampedAge / 10) },
    (_, idx) => idx
  );

  return (
    <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3">
      {decades.map((decadeIndex) => {
        const startYear = decadeIndex * 10 + 1;
        const endYear = Math.min(startYear + 9, clampedAge);
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
              {years.map((year) => (
                <YearRow
                  key={`year-${year}`}
                  year={year}
                  isCurrentYear={year === clampedAge}
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
  year,
  isCurrentYear,
}: {
  year: number;
  isCurrentYear: boolean;
}) => {
  const months = Array.from({ length: 12 }, (_, idx) => idx + 1);

  return (
    <div className="grid grid-cols-12 gap-px">
      {months.map((month) => (
        <span
          key={`${year}-${month}`}
          className={`h-3 w-3 rounded-[2px] transition sm:h-4 sm:w-4 ${
            isCurrentYear
              ? "bg-[var(--foreground)]"
              : "bg-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
          }`}
        />
      ))}
    </div>
  );
};
