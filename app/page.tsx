"use client";

import { useEffect, useState, type ChangeEvent } from "react";

type Theme = "light" | "dark";

const determineTheme = (): Theme => {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "light" : "dark";
};

export default function Home() {
  const [age, setAge] = useState<string>("30");
  const [theme, setTheme] = useState<Theme>("light");

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

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
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
                className="mx-3 w-24 border-b border-[color-mix(in_srgb,var(--foreground)_60%,transparent)] bg-transparent text-center text-5xl font-semibold tracking-tight text-[var(--foreground)] outline-none focus:border-[var(--foreground)]"
                aria-label="Enter your age"
              />{" "}
              years old.
            </p>
            <button
              type="button"
              className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] px-5 py-2 text-2xl font-medium text-[var(--foreground)] transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
              aria-label="Confirm age"
            >
              ↵
            </button>
          </div>
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
