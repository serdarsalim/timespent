"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { UserInfo } from "./components/UserInfo";
import { migrateFromLocalStorage } from "@/lib/migrate";
import {
  loadAllData,
  saveGoals,
  saveSchedule,
  saveProductivity,
  saveWeeklyNotes,
  saveFocusAreas,
  saveMonthEntries,
  saveProfile
} from "@/lib/api";

type Theme = "light" | "dark";

type FocusArea = {
  id: string;
  name: string;
  hours: string;
};

type RepeatFrequency = "none" | "daily" | "weekly" | "biweekly" | "monthly";

type ScheduleEntry = {
  time: string;
  endTime?: string;
  title: string;
  color?: string;
  repeat?: RepeatFrequency;
  repeatUntil?: string | null;
  repeatDays?: WeekdayIndex[];
  skipDates?: string[];
};

type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WEEK_START_OPTIONS: { value: WeekdayIndex; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const ALL_WEEKDAY_INDICES: WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

const WEEKDAY_SHORT_LABELS: string[] = Array.from({ length: 7 }, (_, day) =>
  new Date(2020, 5, day + 7).toLocaleDateString(undefined, {
    weekday: "short",
  })
);

const TIME_OPTIONS: string[] = Array.from({ length: 24 * 2 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = (index % 2) * 30;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

type EntryMeta = {
  originalDayKey?: string;
  originalEntryIndex?: number;
};

type EntryResolution = {
  entries: Record<string, ScheduleEntry[]>;
  targetDayKey: string;
  targetIndex: number | null;
};

type EditingEntryState = {
  dayKey: string;
  index: number;
  meta: EntryMeta;
  data: ScheduleEntry;
  scope: "single" | "future";
  canChooseScope: boolean;
};

const defaultFocusAreas: FocusArea[] = [
  { id: "sleep", name: "Sleep", hours: "8" },
  { id: "eating", name: "Eating", hours: "2" },
  { id: "body", name: "Body functions", hours: "1" },
  { id: "work", name: "Work", hours: "8" },
];

type ViewMode = "life" | "productivity" | "goals";

type KeyResultStatus = "started" | "pending" | "on-hold" | "completed";

type KeyResult = {
  id: string;
  title: string;
  status: KeyResultStatus;
};

type Goal = {
  id: string;
  title: string;
  timeframe: string;
  description?: string;
  keyResults: KeyResult[];
  statusOverride?: KeyResultStatus;
};

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";
const PRODUCTIVITY_SCALE = [
  { value: 0, label: "Low", color: "bg-[#fefae6]" },
  { value: 1, label: "Medium", color: "bg-[#d9f0a3]" },
  { value: 2, label: "High", color: "bg-[#a6d96a]" },
  // { value: 3, label: ">75%", color: "bg-[#66bd63]" }, // Hidden for now
];

type WeekMeta = {
  weekNumber: number;
  months: number[];
  dayKeys: string[];
  primaryMonth: number;
  rangeLabel: string;
};

const getWeekStart = (date: Date, weekStartDay: WeekdayIndex = 1) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const formatISOWeekInputValue = (date: Date) => {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNumber =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7
    );
  return `${target.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
};

const parseISOWeekInputValue = (value: string) => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, yearStr, weekStr] = match;
  const year = Number(yearStr);
  const week = Number(weekStr);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }
  const reference = new Date(year, 0, 4);
  const start = getWeekStart(reference);
  start.setDate(start.getDate() + (week - 1) * 7);
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(defaultFocusAreas);
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [recentYears, setRecentYears] = useState<string>("10");
  const [view, setView] = useState<ViewMode>("life");
  const [isHydrated, setIsHydrated] = useState(false);
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
  const [scheduleEntries, setScheduleEntries] = useState<
    Record<string, ScheduleEntry[]>
  >({});
  const [weekStartDay, setWeekStartDay] = useState<WeekdayIndex>(1);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalTimeframe, setNewGoalTimeframe] = useState("");
  const [krDrafts, setKrDrafts] = useState<Record<string, { title: string }>>({});
  const [activeKrDraftGoalId, setActiveKrDraftGoalId] = useState<string | null>(null);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [goalFieldDrafts, setGoalFieldDrafts] = useState<
    Record<string, { title?: string; timeframe?: string }>
  >({});
  const [activeGoalFieldEdit, setActiveGoalFieldEdit] = useState<{
    goalId: string;
    field: "title" | "timeframe";
  } | null>(null);
  const [krFieldDrafts, setKrFieldDrafts] = useState<
    Record<string, { title?: string }>
  >({});
  const [activeKrFieldEdit, setActiveKrFieldEdit] = useState<{
    goalId: string;
    krId: string;
    field: "title";
  } | null>(null);
  const [weeklyNotes, setWeeklyNotes] = useState<Record<string, string>>({});
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    async function loadData() {
      let shouldOpenProfileModal: boolean | null = null;
      try {
        // First check if user is logged in by trying to fetch session
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();

        if (session?.user) {
          // User is logged in - try to migrate from localStorage if needed
          await migrateFromLocalStorage();

          // Load data from database
          const data = await loadAllData();

          if (data) {
            // Set state from database
            if (data.goals.length > 0) setGoals(data.goals);
            if (Object.keys(data.scheduleEntries).length > 0) setScheduleEntries(data.scheduleEntries);
            if (Object.keys(data.productivityRatings).length > 0) setProductivityRatings(data.productivityRatings);
            if (Object.keys(data.weeklyNotes).length > 0) setWeeklyNotes(data.weeklyNotes);
            if (data.focusAreas.length > 0) setFocusAreas(data.focusAreas);
            if (Object.keys(data.monthEntries).length > 0) setMonthEntries(data.monthEntries);

            // Set profile data
            if (data.profile) {
              if (data.profile.personName) setPersonName(data.profile.personName);
              if (data.profile.dateOfBirth) setDateOfBirth(data.profile.dateOfBirth);
              if (data.profile.weekStartDay !== undefined) setWeekStartDay(data.profile.weekStartDay as WeekdayIndex);
              if (data.profile.recentYears) setRecentYears(data.profile.recentYears);

              const complete = Boolean(data.profile.personName);
              shouldOpenProfileModal = !complete;
            }
          }
        }

        // Also load UI preferences from localStorage (these are not in DB)
        const storedProductivityGoal = window.localStorage.getItem("timespent-productivity-goals");
        if (storedProductivityGoal) {
          const parsedGoals = JSON.parse(storedProductivityGoal) as Record<number, string>;
          if (parsedGoals && typeof parsedGoals === "object") {
            setProductivityGoals(parsedGoals);
          }
        }

        const storedView = window.localStorage.getItem("timespent-active-view");
        if (storedView === "life" || storedView === "productivity" || storedView === "goals") {
          setView(storedView);
        }

        const storedProfileModalPreference = window.localStorage.getItem("timespent-profile-modal-open");
        if (storedProfileModalPreference === "true") {
          shouldOpenProfileModal = true;
        } else if (storedProfileModalPreference === "false") {
          shouldOpenProfileModal = false;
        }

        setIsEditingProfile(shouldOpenProfileModal ?? false);
        setIsHydrated(true);
      } catch (error) {
        console.error("Failed to load data", error);
        setIsHydrated(true);
      }
    }

    loadData();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    try {
      window.localStorage.setItem(
        "timespent-profile-modal-open",
        isEditingProfile ? "true" : "false"
      );
    } catch (error) {
      console.error("Failed to cache profile modal state", error);
    }
  }, [isEditingProfile, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-profile",
        JSON.stringify({
          name: personName,
          dateOfBirth,
          email,
        })
      );

      // Save to database
      saveProfile({
        personName: personName || null,
        dateOfBirth: dateOfBirth || null,
        weekStartDay,
        recentYears
      });
    } catch (error) {
      console.error("Failed to save profile", error);
    }
  }, [personName, dateOfBirth, email, weekStartDay, recentYears, isHydrated]);

  useEffect(() => {
    try {
      window.localStorage.setItem("timespent-active-view", view);
    } catch (error) {
      console.error("Failed to cache active view", error);
    }
  }, [view]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-focus-areas",
        JSON.stringify(focusAreas)
      );

      // Save to database
      saveFocusAreas(focusAreas);
    } catch (error) {
      console.error("Failed to save focus areas", error);
    }
  }, [focusAreas, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-life-entries",
        JSON.stringify(monthEntries)
      );

      // Save to database
      saveMonthEntries(monthEntries);
    } catch (error) {
      console.error("Failed to save month entries", error);
    }
  }, [monthEntries, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-productivity-ratings",
        JSON.stringify(productivityRatings)
      );

      // Save to database
      saveProductivity(productivityRatings);
    } catch (error) {
      console.error("Failed to save productivity ratings", error);
    }
  }, [productivityRatings, isHydrated]);

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

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-schedule-entries",
        JSON.stringify(scheduleEntries)
      );

      // Save to database
      saveSchedule(scheduleEntries);
    } catch (error) {
      console.error("Failed to save schedule entries", error);
    }
  }, [scheduleEntries, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-goals",
        JSON.stringify(goals)
      );

      // Save to database
      saveGoals(goals);
    } catch (error) {
      console.error("Failed to save goals", error);
    }
  }, [goals, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-week-start",
        String(weekStartDay)
      );
      // weekStartDay is saved as part of profile in the database
    } catch (error) {
      console.error("Failed to save week start preference", error);
    }
  }, [weekStartDay, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      // Save to localStorage as backup
      window.localStorage.setItem(
        "timespent-weekly-notes",
        JSON.stringify(weeklyNotes)
      );

      // Save to database
      saveWeeklyNotes(weeklyNotes);
    } catch (error) {
      console.error("Failed to save weekly notes", error);
    }
  }, [weeklyNotes, isHydrated]);

  // Set current week as selected by default when viewing productivity tracker
  useEffect(() => {
    if (view === "productivity" && selectedWeek === null) {
      const weeks = buildWeeksForYear(productivityYear);
      const today = new Date();
      const currentWeek = weeks.find((week) =>
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
        setSelectedWeek(currentWeek.weekNumber);
      }
    }
  }, [view, productivityYear, selectedWeek]);

  const isProfileComplete = Boolean(personName && dateOfBirth && email);
  const isProfileEditorVisible = isEditingProfile;

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

  const generateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAddGoal = () => {
    const title = newGoalTitle.trim();
    if (!title) {
      return;
    }
    const timeframe = newGoalTimeframe.trim() || "This quarter";
    const nextGoal: Goal = {
      id: generateId(),
      title,
      timeframe,
      keyResults: [],
    };
    setGoals((prev) => [...prev, nextGoal]);
    setNewGoalTitle("");
    setNewGoalTimeframe("");
    setIsAddingGoal(false);
  };

  const handleRemoveGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
    setKrDrafts((prev) => {
      if (!(goalId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[goalId];
      return next;
    });
  };

const handleKrDraftChange = (goalId: string, value: string) => {
  setKrDrafts((prev) => ({
    ...prev,
    [goalId]: {
      title: value,
    },
  }));
};

  const startKeyResultDraft = (goalId: string) => {
    setActiveKrDraftGoalId(goalId);
    setKrDrafts((prev) => ({
      ...prev,
      [goalId]: prev[goalId] ?? { title: "" },
    }));
  };

  const cancelKeyResultDraft = (goalId: string) => {
    setActiveKrDraftGoalId((prev) => (prev === goalId ? null : prev));
    setKrDrafts((prev) => {
      if (!(goalId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[goalId];
      return next;
    });
  };

  const startGoalDraft = () => {
    setIsAddingGoal(true);
  };

  const cancelGoalDraft = () => {
    setIsAddingGoal(false);
    setNewGoalTitle("");
    setNewGoalTimeframe("");
  };

  const beginGoalFieldEdit = (goal: Goal, field: "title" | "timeframe") => {
    const currentValue = field === "title" ? goal.title : goal.timeframe;
    setActiveGoalFieldEdit({ goalId: goal.id, field });
    setGoalFieldDrafts((prev) => ({
      ...prev,
      [goal.id]: {
        ...prev[goal.id],
        [field]: prev[goal.id]?.[field] ?? currentValue,
      },
    }));
  };

  const handleGoalFieldDraftChange = (
    goalId: string,
    field: "title" | "timeframe",
    value: string
  ) => {
    setGoalFieldDrafts((prev) => ({
      ...prev,
      [goalId]: {
        ...prev[goalId],
        [field]: value,
      },
    }));
  };

  const clearGoalFieldDraft = (goalId: string, field: "title" | "timeframe") => {
    setGoalFieldDrafts((prev) => {
      const existing = prev[goalId];
      if (!existing) {
        return prev;
      }
      const nextFieldState = { ...existing };
      delete nextFieldState[field];
      if (Object.keys(nextFieldState).length === 0) {
        const next = { ...prev };
        delete next[goalId];
        return next;
      }
      return {
        ...prev,
        [goalId]: nextFieldState,
      };
    });
  };

  const commitGoalFieldEdit = (
    goalId: string,
    field: "title" | "timeframe"
  ) => {
    const draftValue = goalFieldDrafts[goalId]?.[field];
    const trimmed = draftValue?.trim();
    if (!trimmed) {
      cancelGoalFieldEdit(goalId, field);
      return;
    }
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              ...(field === "title"
                ? { title: trimmed }
                : { timeframe: trimmed }),
            }
          : goal
      )
    );
    if (
      activeGoalFieldEdit?.goalId === goalId &&
      activeGoalFieldEdit.field === field
    ) {
      setActiveGoalFieldEdit(null);
    }
    clearGoalFieldDraft(goalId, field);
  };

  const cancelGoalFieldEdit = (
    goalId: string,
    field: "title" | "timeframe"
  ) => {
    if (
      activeGoalFieldEdit?.goalId === goalId &&
      activeGoalFieldEdit.field === field
    ) {
      setActiveGoalFieldEdit(null);
    }
    clearGoalFieldDraft(goalId, field);
  };

  const krFieldKey = (goalId: string, krId: string) => `${goalId}-${krId}`;

const beginKrFieldEdit = (
  goalId: string,
  kr: KeyResult,
  field: "title"
) => {
  const currentValue = kr.title;
  setActiveKrFieldEdit({ goalId, krId: kr.id, field });
  const key = krFieldKey(goalId, kr.id);
  setKrFieldDrafts((prev) => ({
    ...prev,
    [key]: {
      title: prev[key]?.title ?? currentValue,
    },
  }));
};

  const handleKrFieldDraftChange = (
    goalId: string,
    krId: string,
    value: string
  ) => {
    const key = krFieldKey(goalId, krId);
    setKrFieldDrafts((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        title: value,
      },
    }));
  };

  const clearKrFieldDraft = (
    goalId: string,
    krId: string,
    field: "title"
  ) => {
    const key = krFieldKey(goalId, krId);
    setKrFieldDrafts((prev) => {
      const existing = prev[key];
      if (!existing) {
        return prev;
      }
      const nextFieldState = { ...existing };
      delete nextFieldState[field];
      if (Object.keys(nextFieldState).length === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: nextFieldState,
      };
    });
  };

  const commitKrFieldEdit = (
    goalId: string,
    krId: string,
    field: "title"
  ) => {
    const key = krFieldKey(goalId, krId);
    const draftValue = krFieldDrafts[key]?.title;
    const trimmed = draftValue?.trim();
    if (!trimmed) {
      cancelKrFieldEdit(goalId, krId, field);
      return;
    }
    setGoals((prev) =>
      prev.map((goal) =>
      goal.id === goalId
        ? {
            ...goal,
            keyResults: goal.keyResults.map((kr) =>
              kr.id === krId
                ? {
                    ...kr,
                    title: trimmed,
                  }
                : kr
            ),
          }
        : goal
      )
    );
    if (
      activeKrFieldEdit?.goalId === goalId &&
      activeKrFieldEdit.krId === krId &&
      activeKrFieldEdit.field === field
    ) {
      setActiveKrFieldEdit(null);
    }
    clearKrFieldDraft(goalId, krId, field);
  };

  const cancelKrFieldEdit = (
    goalId: string,
    krId: string,
    field: "title"
  ) => {
    if (
      activeKrFieldEdit?.goalId === goalId &&
      activeKrFieldEdit.krId === krId &&
      activeKrFieldEdit.field === field
    ) {
      setActiveKrFieldEdit(null);
    }
    clearKrFieldDraft(goalId, krId, field);
  };

  const handleGoalFieldKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    goalId: string,
    field: "title" | "timeframe"
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitGoalFieldEdit(goalId, field);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelGoalFieldEdit(goalId, field);
    }
  };

  const handleKeyResultFieldKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    goalId: string,
    krId: string,
    field: "title"
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitKrFieldEdit(goalId, krId, field);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelKrFieldEdit(goalId, krId, field);
    }
  };

  const handleAddKeyResult = (goalId: string) => {
    const draft = krDrafts[goalId];
    const title = draft?.title?.trim() ?? "";
    if (!title) {
      return;
    }
    const newKr: KeyResult = {
      id: generateId(),
      title,
      status: "started",
    };
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId
          ? { ...goal, keyResults: [...goal.keyResults, newKr] }
          : goal
      )
    );
    setKrDrafts((prev) => {
      const next = { ...prev };
      delete next[goalId];
      return next;
    });
    setActiveKrDraftGoalId((prev) => (prev === goalId ? null : prev));
  };

  const handleRemoveKeyResult = (goalId: string, krId: string) => {
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              keyResults: goal.keyResults.filter((kr) => kr.id !== krId),
            }
          : goal
      )
    );
  };

  const cycleKeyResultStatus = (goalId: string, krId: string) => {
    const order: KeyResultStatus[] = ["started", "pending", "on-hold", "completed"];
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              keyResults: goal.keyResults.map((kr) => {
                if (kr.id !== krId) {
                  return kr;
                }
                const currentIndex = order.indexOf(kr.status);
                const nextStatus = order[(currentIndex + 1) % order.length];
                return { ...kr, status: nextStatus };
              }),
            }
          : goal
      )
    );
  };

const goalStatusBadge = (status: KeyResultStatus) => {
  switch (status) {
    case "started":
      return "bg-[#dbeafe] text-[#1d4ed8]";
    case "pending":
      return "bg-[#fef3c7] text-[#b45309]";
    case "on-hold":
      return "bg-[#fef9c3] text-[#92400e]";
    case "completed":
      return "bg-[#dcfce7] text-[#15803d]";
    default:
      return "bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] text-foreground";
  }
};

  const cycleGoalStatusOverride = (goalId: string) => {
    const order: KeyResultStatus[] = ["started", "pending", "on-hold", "completed"];
    setGoals((prev) =>
      prev.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }
        const current =
          goal.statusOverride ?? deriveGoalStatusFromKeyResults(goal);
        const currentIndex = order.indexOf(current);
        const isOverrideActive = Boolean(goal.statusOverride);
        const shouldClear =
          isOverrideActive && currentIndex === order.length - 1;
        if (shouldClear) {
          return {
            ...goal,
            statusOverride: undefined,
          };
        }
        const nextStatus = order[(currentIndex + 1) % order.length];
        return {
          ...goal,
          statusOverride: nextStatus,
        };
      })
    );
  };

  const deriveGoalStatusFromKeyResults = (goal: Goal): KeyResultStatus => {
    if (
      goal.keyResults.length > 0 &&
      goal.keyResults.every((kr) => kr.status === "completed")
    ) {
      return "completed";
    }
    if (goal.keyResults.some((kr) => kr.status === "on-hold")) {
      return "on-hold";
    }
    if (goal.keyResults.some((kr) => kr.status === "pending")) {
      return "pending";
    }
    return "started";
  };

  const deriveGoalStatus = (goal: Goal): KeyResultStatus => {
    if (goal.statusOverride) {
      return goal.statusOverride;
    }
    return deriveGoalStatusFromKeyResults(goal);
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

  const parsedRecentYears = useMemo(() => {
    const parsed = Number.parseInt(recentYears, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(parsed, 90);
  }, [recentYears]);

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

  if (!isHydrated) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors">
      <header className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-4 py-2 text-sm">
        <nav className="flex gap-2 text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
          <button
            type="button"
            onClick={() => setView("life")}
            className={`rounded-full px-4 py-1 transition ${
              view === "life"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-foreground"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setView("productivity")}
            className={`rounded-full px-4 py-1 transition ${
              view === "productivity"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-foreground"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            Tracker
          </button>
          <button
            type="button"
            onClick={() => setView("goals")}
            className={`rounded-full px-4 py-1 transition ${
              view === "goals"
                ? "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] text-foreground"
                : "text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]"
            }`}
          >
            Goals
          </button>
        </nav>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
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
        <div className="w-full py-2 text-center">
          {view === "life" && (
            <section className="mt-8 space-y-6">
              <WeeklySchedule
                scheduleEntries={scheduleEntries}
                setScheduleEntries={setScheduleEntries}
                weekStartDay={weekStartDay}
              />
            </section>
          )}

          {view === "goals" && (
            <section className="mx-auto mt-8 flex max-w-5xl flex-col gap-4 text-left">
              <div className="space-y-3">
                {goals.length === 0 && (
                  <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                    No goals yet. Define your first objective above to start tracking OKRs.
                  </p>
                )}
                {goals.map((goal) => {
                  const status = deriveGoalStatus(goal);
                  const draft = krDrafts[goal.id] ?? { title: "" };
                  return (
                    <div
                      key={goal.id}
                      className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] px-7 py-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-1 flex-col">
                          {activeGoalFieldEdit?.goalId === goal.id &&
                          activeGoalFieldEdit.field === "title" ? (
                            <input
                              type="text"
                              value={goalFieldDrafts[goal.id]?.title ?? goal.title}
                              onChange={(event) =>
                                handleGoalFieldDraftChange(
                                  goal.id,
                                  "title",
                                  event.target.value
                                )
                              }
                              onBlur={() => commitGoalFieldEdit(goal.id, "title")}
                              onKeyDown={(event) =>
                                handleGoalFieldKeyDown(event, goal.id, "title")
                              }
                              autoFocus
                              className="w-full border-b border-transparent bg-transparent text-2xl font-light text-foreground outline-none focus:border-foreground"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginGoalFieldEdit(goal, "title")}
                              className="text-left text-2xl font-light text-foreground transition hover:text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                            >
                              {goal.title}
                            </button>
                          )}
                          {activeGoalFieldEdit?.goalId === goal.id &&
                          activeGoalFieldEdit.field === "timeframe" ? (
                            <input
                              type="text"
                              value={
                                goalFieldDrafts[goal.id]?.timeframe ?? goal.timeframe
                              }
                              onChange={(event) =>
                                handleGoalFieldDraftChange(
                                  goal.id,
                                  "timeframe",
                                  event.target.value
                                )
                              }
                              onBlur={() => commitGoalFieldEdit(goal.id, "timeframe")}
                              onKeyDown={(event) =>
                                handleGoalFieldKeyDown(event, goal.id, "timeframe")
                              }
                              autoFocus
                              className="mt-1 w-full border-b border-transparent bg-transparent text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] outline-none focus:border-foreground"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginGoalFieldEdit(goal, "timeframe")}
                              className="mt-1 text-left text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] transition hover:text-foreground"
                            >
                              {goal.timeframe}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveGoal(goal.id)}
                            className="text-xs text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] transition hover:text-foreground"
                            aria-label="Remove goal"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {goal.keyResults.map((kr, krIndex) => {
                          const krKey = krFieldKey(goal.id, kr.id);
                          const isEditingKrTitle =
                            activeKrFieldEdit?.goalId === goal.id &&
                            activeKrFieldEdit.krId === kr.id &&
                            activeKrFieldEdit.field === "title";
                          const isLastKr = krIndex === goal.keyResults.length - 1;
                          return (
                            <div
                              key={kr.id}
                              className="rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] px-4 pb-3 pt-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex-1 space-y-1">
                                  {isEditingKrTitle ? (
                                    <input
                                      type="text"
                                      value={
                                        krFieldDrafts[krKey]?.title ?? kr.title
                                      }
                                      onChange={(event) =>
                                        handleKrFieldDraftChange(
                                          goal.id,
                                          kr.id,
                                          event.target.value
                                        )
                                      }
                                      onBlur={() =>
                                        commitKrFieldEdit(goal.id, kr.id, "title")
                                      }
                                      onKeyDown={(event) =>
                                        handleKeyResultFieldKeyDown(
                                          event,
                                          goal.id,
                                          kr.id,
                                          "title"
                                        )
                                      }
                                      autoFocus
                                      className="w-full border-b border-transparent bg-transparent text-sm font-medium text-foreground outline-none focus:border-foreground"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        beginKrFieldEdit(goal.id, kr, "title")
                                      }
                                      className="text-left text-sm font-medium text-foreground transition hover:text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                                    >
                                      {kr.title || "Untitled key result"}
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      cycleKeyResultStatus(goal.id, kr.id)
                                    }
                                    className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${goalStatusBadge(
                                      kr.status
                                    )}`}
                                  >
                                {kr.status === "started"
                                  ? "Started"
                                  : kr.status === "pending"
                                  ? "Pending"
                                  : kr.status === "on-hold"
                                  ? "On hold"
                                  : "Completed"}
                                  </button>
                                  {isLastKr && activeKrDraftGoalId !== goal.id && (
                                    <button
                                      type="button"
                                      onClick={() => startKeyResultDraft(goal.id)}
                                      className="text-xs text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:text-foreground"
                                      aria-label="Add key result"
                                    >
                                      +
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveKeyResult(goal.id, kr.id)
                                    }
                                    className="text-xs text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] transition hover:text-foreground"
                                    aria-label="Remove key result"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {activeKrDraftGoalId === goal.id && goal.keyResults.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div className="flex-1 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] p-4">
                              <input
                                type="text"
                                value={draft.title}
                                onChange={(event) =>
                                  handleKrDraftChange(goal.id, event.target.value)
                                }
                                placeholder="Add a key result"
                                className="w-full border-b border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent pb-1 text-sm text-foreground outline-none focus:border-foreground"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAddKeyResult(goal.id)}
                                className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelKeyResultDraft(goal.id)}
                                className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {goal.keyResults.length === 0 && activeKrDraftGoalId !== goal.id && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => startKeyResultDraft(goal.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-base text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:text-foreground"
                              aria-label="Add key result"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-center">
                {!isAddingGoal ? (
                  <button
                    type="button"
                    onClick={startGoalDraft}
                    className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
                  >
                    + Add OKR
                  </button>
                ) : (
                  <div className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        type="text"
                        value={newGoalTitle}
                        onChange={(event) => setNewGoalTitle(event.target.value)}
                        placeholder="Objective title"
                        className="border-b border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] bg-transparent pb-1 text-sm text-foreground outline-none focus:border-foreground"
                      />
                      <input
                        type="text"
                        value={newGoalTimeframe}
                        onChange={(event) => setNewGoalTimeframe(event.target.value)}
                        placeholder="Timeframe (e.g., Q2 2025)"
                        className="border-b border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] bg-transparent pb-1 text-sm text-foreground outline-none focus:border-foreground"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={cancelGoalDraft}
                        className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddGoal}
                        className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {view === "productivity" && (
            <section className="mt-8 grid gap-8 text-left lg:grid-cols-[1.2fr_1fr]">
              <div className="flex flex-col rounded-3xl bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] p-4">
                <div className="mb-4 text-2xl font-light">
                  <span>
                    {selectedWeek !== null
                      ? (() => {
                          const weekMeta = buildWeeksForYear(productivityYear).find(
                            (w) => w.weekNumber === selectedWeek
                          );
                          return weekMeta
                            ? `${weekMeta.rangeLabel}, ${productivityYear}`
                            : `Week ${selectedWeek}`;
                        })()
                      : "Productivity tracking"}
                  </span>
                </div>
                <div className="flex-1">
                  <TinyEditor
                    key={selectedWeek !== null ? `week-notes-${productivityYear}-${selectedWeek}` : `productivity-goal-${productivityYear}`}
                    tinymceScriptSrc={TINYMCE_CDN}
                    value={selectedWeek !== null ? (weeklyNotes[`week-${productivityYear}-${selectedWeek}`] ?? "") : currentProductivityGoal}
                    init={
                      {
                        menubar: false,
                        statusbar: false,
                        height: 420,
                        license_key: "gpl",
                        plugins: "lists",
                        skin: theme === "dark" ? "oxide-dark" : "oxide",
                        content_css: theme === "dark" ? "dark" : "default",
                        toolbar:
                          "bold italic underline | bullist numlist | link removeformat",
                        branding: false,
                        placeholder: selectedWeek !== null ? "Add notes for this week..." : "",
                      } as Record<string, unknown>
                    }
                    onEditorChange={(content) =>
                      selectedWeek !== null
                        ? setWeeklyNotes((prev) => ({
                            ...prev,
                            [`week-${productivityYear}-${selectedWeek}`]: content,
                          }))
                        : setProductivityGoals((prev) => ({
                            ...prev,
                            [productivityYear]: content,
                          }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <ProductivityGrid
                  year={productivityYear}
                  setYear={setProductivityYear}
                  ratings={productivityRatings}
                  setRatings={setProductivityRatings}
                  mode={productivityMode}
                  onToggleMode={() =>
                    setProductivityMode((prev) => (prev === "day" ? "week" : "day"))
                  }
                  selectedWeek={selectedWeek}
                  setSelectedWeek={setSelectedWeek}
                />
              </div>
            </section>
          )}

          <datalist id="time-select-options">
            {TIME_OPTIONS.map((time) => (
              <option key={`time-option-${time}`} value={time} />
            ))}
          </datalist>
        </div>
      </main>

      {isProfileEditorVisible && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setIsEditingProfile(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-6 text-left shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  Profile & preferences
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                Logged in as
              </p>
              <UserInfo />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                Full name
                <input
                  type="text"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder="Your name"
                  className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                />
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                First day of week
                <select
                  value={weekStartDay}
                  onChange={(event) =>
                    setWeekStartDay(Number(event.target.value) as WeekdayIndex)
                  }
                  className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                >
                  {WEEK_START_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}

      {selectedMonth && hasValidBirthdate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setSelectedMonth(null)}
        >
          <div className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-6 text-left shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
                  Month journal
                </p>
                <p className="text-xl font-light text-foreground">
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
              init={
                {
                  menubar: false,
                  statusbar: false,
                  height: 320,
                  license_key: "gpl",
                  skin: theme === "dark" ? "oxide-dark" : "oxide",
                  content_css: theme === "dark" ? "dark" : "default",
                  toolbar:
                    "bold italic underline | bullist numlist | link removeformat",
                  branding: false,
                } as Record<string, unknown>
              }
              onEditorChange={handleEntryChange}
            />
          </div>
        </div>
      )}

      <footer className="mt-24 border-t border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-6 py-4 text-sm">
        <div className="flex items-center justify-between">
          <p>TimeSpent</p>
          <UserInfo />
        </div>
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

  const allYears = Array.from({ length: totalYears }, (_, idx) => idx + 1);

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {allYears.map((yearNumber) => (
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
        const baseClasses =
          "h-3 w-3 rounded-xs transition sm:h-4 sm:w-4 focus:outline-none";

        return (
          <button
            type="button"
            key={key}
            onClick={() => onSelectMonth(yearNumber, displayMonth)}
            className={`${baseClasses} ${
              isSelected
                ? "bg-foreground ring-2 ring-[color-mix(in_srgb,var(--foreground)_40%,transparent)]"
                : hasEntry
                  ? "bg-[#f6ad55] hover:bg-[#f28c28]"
                  : "bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_35%,transparent)]"
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

type WeeklyAllocationGridProps = {
  years: number;
  focusAreas: FocusArea[];
};

const WEEK_COLORS = [
  "#8E7DBE",
  "#F29E4C",
  "#F25C54",
  "#5DA9E9",
  "#80CFA9",
  "#F7B267",
  "#B8F2E6",
  "#C8553D",
];

const WeeklyAllocationGrid = ({
  years,
  focusAreas,
}: WeeklyAllocationGridProps) => {
  const isDailyView = years <= 2;
  const totalUnits = Math.max(1, isDailyView ? years * 365 : years * 52);
  const parsedAreas = focusAreas
    .map((area, index) => ({
      ...area,
      hoursPerDay: Math.max(Number.parseFloat(area.hours) || 0, 0),
      color: WEEK_COLORS[index % WEEK_COLORS.length]!,
    }))
    .filter((area) => area.hoursPerDay > 0);

  const totalHoursPerDay = parsedAreas.reduce(
    (sum, area) => sum + area.hoursPerDay,
    0
  );

  if (parsedAreas.length === 0 || totalHoursPerDay === 0) {
    return null;
  }

  const allocations = parsedAreas.map((area) => {
    const share = area.hoursPerDay / totalHoursPerDay;
    const proportionalUnits = share * totalUnits;
    const wholeUnits = Math.floor(proportionalUnits);
    const remainder = proportionalUnits - wholeUnits;
    return {
      ...area,
      share,
      proportionalUnits,
      unitsInt: wholeUnits,
      remainder,
    };
  });

  const assigned = allocations.reduce((sum, area) => sum + area.unitsInt, 0);
  let remaining = totalUnits - assigned;
  if (remaining > 0) {
    const sorted = [...allocations].sort(
      (a, b) => b.remainder - a.remainder
    );
    let idx = 0;
    while (remaining > 0 && sorted.length > 0) {
      sorted[idx % sorted.length]!.unitsInt += 1;
      remaining -= 1;
      idx += 1;
    }
  }

  const columnsDesktop = isDailyView ? 30 : 26;
  const columnsMobile = isDailyView ? 17 : 15;

  const cells: { color: string; label: string; tooltip: string }[] = [];

  // Add unallocated cells
  const allocatedCount = allocations.reduce((sum, area) => sum + area.unitsInt, 0);
  const unallocatedCount = totalUnits - allocatedCount;
  for (let i = 0; i < unallocatedCount; i += 1) {
    cells.push({
      color: "transparent",
      label: "Unallocated",
      tooltip: "Unallocated time",
    });
  }

  // Add allocated cells sorted from least to most time spent
  const sortedAllocations = [...allocations].sort((a, b) => a.unitsInt - b.unitsInt);
  sortedAllocations.forEach((area) => {
    const percent = area.share * 100;
    const totalDaysPeriod = years * 365;
    const totalDaysInvested = area.share * totalDaysPeriod;
    const months = totalDaysInvested / 30;
    const yearsSpent = totalDaysInvested / 365;

    let durationLabel: string;
    if (yearsSpent >= 1) {
      durationLabel = `${yearsSpent.toFixed(1)} years`;
    } else if (months >= 1) {
      durationLabel = `${months.toFixed(1)} months`;
    } else {
      durationLabel = `${totalDaysInvested.toFixed(0)} days`;
    }

    const tooltip = `${area.name}: ${durationLabel} (${percent.toFixed(1)}%)`;

    for (let i = 0; i < area.unitsInt; i += 1) {
      cells.push({ color: area.color, label: area.name, tooltip });
    }
  });

  const totalUnitsLabel = isDailyView
    ? `${totalUnits} days`
    : `${totalUnits} weeks`;

  return (
    <div className="mx-auto mt-12 w-full max-w-5xl text-left px-4">
      <div className="mb-6 text-center">
        <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]" style={{ fontFamily: "'Lato', 'Helvetica Neue', Arial, sans-serif" }}>
          {years} year{years > 1 ? "s" : ""} • {totalUnitsLabel}
        </p>
      </div>
      <div className="flex justify-center">
        <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-4 w-full max-w-fit">
          <style dangerouslySetInnerHTML={{
            __html: `
              .time-allocation-grid {
                grid-template-columns: repeat(${columnsMobile}, minmax(18px, 1fr));
              }
              @media (min-width: 640px) {
                .time-allocation-grid {
                  grid-template-columns: repeat(${columnsDesktop}, minmax(18px, 1fr));
                }
              }
            `
          }} />
          <div className="time-allocation-grid grid gap-1">
            {cells.map((cell, idx) => (
              <div
                key={`week-cell-${idx}-${cell.label}`}
                className="aspect-square rounded-xs border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] hover:scale-110 hover:z-10 transition-transform cursor-pointer"
                style={{ backgroundColor: cell.color }}
                title={cell.tooltip}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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
  setYear: React.Dispatch<React.SetStateAction<number>>;
  ratings: Record<string, number | null>;
  setRatings: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  mode: "day" | "week";
  onToggleMode: () => void;
  selectedWeek: number | null;
  setSelectedWeek: React.Dispatch<React.SetStateAction<number | null>>;
};

const ProductivityGrid = ({
  year,
  setYear,
  ratings,
  setRatings,
  mode,
  onToggleMode,
  selectedWeek,
  setSelectedWeek,
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
        className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[9px] uppercase text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
        aria-label={`Switch to ${mode === "week" ? "day" : "week"} view`}
      >
        {toggleLabel}
      </button>
    </div>
  );

  const handleCycle = (monthIndex: number, day: number) => {
    const key = `${year}-${monthIndex + 1}-${day}`;

    // Find which week this day belongs to
    const targetDate = new Date(year, monthIndex, day);
    const weekForDay = weeks.find((week) =>
      week.dayKeys.some((dayKey) => {
        const [y, m, d] = dayKey.split("-").map(Number);
        return y === year && m === monthIndex + 1 && d === day;
      })
    );
    if (weekForDay) {
      setSelectedWeek(weekForDay.weekNumber);
    }

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

  const handleWeekCycle = (weekNumber: number, hasDayScores: boolean) => {
    const key = `week-${year}-${weekNumber}`;
    setSelectedWeek(weekNumber);

    // Only cycle rating if there are no day scores
    if (!hasDayScores) {
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
    }
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
      <div className="mt-2">
        {days.map((dayOfMonth) => {
          return (
          <div
            key={`row-${dayOfMonth}`}
            className="grid items-center"
            style={{
              gridTemplateColumns: `${dayColumnWidth} repeat(12, minmax(0, 1fr))`,
              columnGap: "0.5rem",
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
              const currentValue = hasValue ? Math.min(storedValue!, PRODUCTIVITY_SCALE.length - 1) : 0;
              const scale = PRODUCTIVITY_SCALE[currentValue];
              const validDay =
                dayOfMonth <= daysInMonth(year, monthIndex);

              if (!validDay) {
                return (
                  <span
                    key={`${key}-empty`}
                    className="h-4 w-full rounded-sm border border-dashed border-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                    aria-hidden="true"
                  />
                );
              }

              const today = new Date();
              const isToday =
                today.getFullYear() === year &&
                today.getMonth() === monthIndex &&
                today.getDate() === dayOfMonth;

              // Check if the previous day (day above) is today (so this day should have golden top border)
              const isPreviousDayToday =
                today.getFullYear() === year &&
                today.getMonth() === monthIndex &&
                today.getDate() === dayOfMonth - 1;

              // Week border logic (all months)
              let weekBorderClass = "";
              // Find the week this day belongs to
              const currentWeek = weeks.find((week) =>
                week.dayKeys.includes(`${year}-${monthIndex + 1}-${dayOfMonth}`)
              );

              if (currentWeek) {
                // Check if this is the first day in this month that belongs to this week
                const isFirstInMonth = !currentWeek.dayKeys.some(dayKey => {
                  const [y, m, d] = dayKey.split("-").map(Number);
                  return y === year && m === monthIndex + 1 && d! < dayOfMonth;
                });

                // Check if next day in this month is in same week
                const nextDayInWeek = dayOfMonth < daysInMonth(year, monthIndex) && currentWeek.dayKeys.includes(`${year}-${monthIndex + 1}-${dayOfMonth + 1}`);

                // Top border: golden if previous day is today, otherwise first day of week (stronger) or between days (visible divider)
                const borderTop = isPreviousDayToday
                  ? "border-t-2 border-t-yellow-400"
                  : isFirstInMonth ? "border-t border-t-gray-400" : "border-t-[0.5px] border-t-gray-300";
                // Bottom border: last day of week (stronger) or between days (visible divider)
                const borderBottom = !nextDayInWeek ? "border-b border-b-gray-400" : "border-b-[0.5px] border-b-gray-300";
                // Left and right borders: always on for week grouping
                const borderSides = "border-l border-r border-l-gray-400 border-r-gray-400";

                weekBorderClass = `${borderTop} ${borderBottom} ${borderSides}`;
              }

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleCycle(monthIndex, dayOfMonth)}
                  onKeyDown={(e) => {
                    if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      setRatings((prev) => ({ ...prev, [key]: null }));
                    }
                  }}
                  className={`h-4 w-full text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] ${weekBorderClass} ${
                    hasValue
                      ? scale.color
                      : "bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
                  } ${
                    isToday
                      ? "ring-2 ring-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.4)]"
                      : ""
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
        );
        })}
      </div>
      <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
        <div className="flex flex-wrap gap-3">
          {PRODUCTIVITY_SCALE.map((scale) => (
            <div key={scale.value} className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={`h-4 w-4 rounded ${scale.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)]`}
                aria-hidden="true"
              />
              <span>{scale.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear(year - 1)}
            className="rounded p-1 hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
            aria-label="Previous year"
          >
            ←
          </button>
          <span className="font-semibold">{year}</span>
          <button
            type="button"
            onClick={() => setYear(year + 1)}
            className="rounded p-1 hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
            aria-label="Next year"
          >
            →
          </button>
        </div>
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
                  ? ""
                  : manualScore ?? "";
                const colorIndex = hasDayScores
                  ? Math.max(
                      0,
                      Math.min(
                        PRODUCTIVITY_SCALE.length - 1,
                        Math.round(dayAverage ?? 0)
                      )
                    )
                  : manualScore !== null && manualScore !== undefined
                    ? Math.min(manualScore, PRODUCTIVITY_SCALE.length - 1)
                    : null;
                const scaleClass =
                  colorIndex !== null && colorIndex !== undefined
                    ? PRODUCTIVITY_SCALE[colorIndex].color
                    : "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]";
                return (
                  <div key={`week-card-${week.weekNumber}`}>
                    <button
                      type="button"
                      onClick={() => handleWeekCycle(week.weekNumber, hasDayScores)}
                      onKeyDown={(e) => {
                        if (!hasDayScores && (e.key === "Delete" || e.key === "Backspace")) {
                          e.preventDefault();
                          const key = `week-${year}-${week.weekNumber}`;
                          setRatings((prev) => ({ ...prev, [key]: null }));
                        }
                      }}
                      className={`flex h-4 w-full items-center justify-center rounded-sm border text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] ${
                        hasDayScores
                          ? "cursor-pointer"
                          : "hover:opacity-90"
                      } ${scaleClass} border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]`}
                      title={`${week.rangeLabel}${hasDayScores ? " (rating locked from daily view)" : ""}`}
                      aria-label={
                        hasDayScores
                          ? `Week ${week.weekNumber} ${week.rangeLabel}, averaged score ${dayAverage}, click to select week`
                          : `Week ${week.weekNumber} ${week.rangeLabel}, current score ${manualScore ?? "unset"}, click to cycle rating`
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
        <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          <div className="flex flex-wrap gap-3">
            {PRODUCTIVITY_SCALE.map((scale) => (
              <div key={scale.value} className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className={`h-4 w-4 rounded ${scale.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)]`}
                  aria-hidden="true"
                />
                <span>{scale.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setYear(year - 1)}
              className="rounded p-1 hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
              aria-label="Previous year"
            >
              ←
            </button>
            <span className="font-semibold">{year}</span>
            <button
              type="button"
              onClick={() => setYear(year + 1)}
              className="rounded p-1 hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
              aria-label="Next year"
            >
              →
            </button>
          </div>
        </div>
      </div>
    );
  };

  return mode === "day" ? renderDayGrid() : renderWeekGrid();
};

type WeeklyScheduleProps = {
  scheduleEntries: Record<string, ScheduleEntry[]>;
  setScheduleEntries: React.Dispatch<
    React.SetStateAction<Record<string, ScheduleEntry[]>>
  >;
  weekStartDay: WeekdayIndex;
};

const WeeklySchedule = ({
  scheduleEntries,
  setScheduleEntries,
  weekStartDay,
}: WeeklyScheduleProps) => {
  const [currentWeekAnchor, setCurrentWeekAnchor] = useState(() =>
    getWeekStart(new Date(), weekStartDay)
  );
  const [activeEntry, setActiveEntry] = useState<EditingEntryState | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<{ dayKey: string; index: number } | null>(null);

  const currentWeekStart = useMemo(
    () => getWeekStart(currentWeekAnchor, weekStartDay),
    [currentWeekAnchor, weekStartDay]
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + idx);
      return day;
    });
  }, [currentWeekStart]);

  const weekRangeLabel = useMemo(() => {
    const weekStart = weekDays[0];
    if (!weekStart) {
      return "";
    }
    return weekStart.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [weekDays]);

  const weekInputValue = useMemo(
    () => formatISOWeekInputValue(currentWeekStart),
    [currentWeekStart]
  );

  const goToWeek = (date: Date) => {
    setCurrentWeekAnchor(getWeekStart(date, weekStartDay));
  };

  const handleWeekNavigation = (direction: -1 | 1) => {
    setCurrentWeekAnchor((prev) => {
      const anchor = getWeekStart(prev, weekStartDay);
      const next = new Date(anchor);
      next.setDate(anchor.getDate() + direction * 7);
      return next;
    });
  };

  const handleWeekPickerChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { value } = event.target;
    if (!value) {
      return;
    }
    const parsed = parseISOWeekInputValue(value);
    if (parsed) {
      setCurrentWeekAnchor(getWeekStart(parsed, weekStartDay));
    }
  };
  const formatDayKey = (date: Date) => {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };

  const parseDayKey = (key: string) => {
    const [yearStr, monthStr, dayStr] = key.split("-").map(Number);
    if (
      !Number.isFinite(yearStr) ||
      !Number.isFinite(monthStr) ||
      !Number.isFinite(dayStr)
    ) {
      return null;
    }
    const parsed = new Date(yearStr, monthStr - 1, dayStr);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  };

  const getPreviousDayKey = (key: string) => {
    const parsed = parseDayKey(key);
    if (!parsed) {
      return null;
    }
    parsed.setDate(parsed.getDate() - 1);
    return formatDayKey(parsed);
  };

  const addEntry = (dayKey: string) => {
    setScheduleEntries((prev) => ({
      ...prev,
      [dayKey]: [
        ...(prev[dayKey] || []),
        { time: "09:00", endTime: "10:00", title: "New task" },
      ],
    }));
  };

  const removeEntry = (
    dayKey: string,
    index: number,
    meta?: EntryMeta,
    scope: "single" | "future" = "future"
  ): EntryResolution | null => {
    let latestResolution: EntryResolution | null = null;
    setScheduleEntries((prev) => {
      const resolution = prepareEntriesForMutation(
        prev,
        dayKey,
        index,
        meta,
        scope
      );
      latestResolution = resolution;
      if (resolution.targetIndex === null) {
        return prev;
      }
      const updated = { ...resolution.entries };
      const entries = [...(updated[resolution.targetDayKey] || [])];
      entries.splice(resolution.targetIndex, 1);
      if (entries.length === 0) {
        delete updated[resolution.targetDayKey];
      } else {
        updated[resolution.targetDayKey] = entries;
      }
      return updated;
    });
    return latestResolution;
  };

  const updateEntry = (
    dayKey: string,
    index: number,
    field:
      | "time"
      | "endTime"
      | "title"
      | "color"
      | "repeat"
      | "repeatDays",
    value: string | WeekdayIndex[],
    meta?: EntryMeta,
    scope: "single" | "future" = "future"
  ): EntryResolution | null => {
    let latestResolution: EntryResolution | null = null;
    setScheduleEntries((prev) => {
      const resolution = prepareEntriesForMutation(
        prev,
        dayKey,
        index,
        meta,
        scope
      );
      latestResolution = resolution;
      if (resolution.targetIndex === null) {
        return prev;
      }
      const updated = { ...resolution.entries };
      const entries = [...(updated[resolution.targetDayKey] || [])];
      const currentEntry = { ...entries[resolution.targetIndex]! };

      if (field === "repeat") {
        const repeatValue = value as string;
        if (repeatValue === "none") {
          currentEntry.repeat = undefined;
          currentEntry.repeatUntil = null;
          currentEntry.repeatDays = undefined;
        } else if (repeatValue === "daily") {
          currentEntry.repeat = repeatValue as RepeatFrequency;
          if (!currentEntry.repeatDays || currentEntry.repeatDays.length === 0) {
            currentEntry.repeatDays = [...ALL_WEEKDAY_INDICES];
          }
        } else {
          currentEntry.repeat = repeatValue as RepeatFrequency;
          currentEntry.repeatDays = undefined;
        }
      } else if (field === "repeatDays") {
        currentEntry.repeatDays = Array.isArray(value)
          ? (value as WeekdayIndex[])
          : undefined;
      } else if (field === "time") {
        currentEntry.time = value as string;
      } else if (field === "endTime") {
        currentEntry.endTime = value as string;
      } else if (field === "title") {
        currentEntry.title = value as string;
      } else if (field === "color") {
        currentEntry.color = value as string;
      }

      entries[resolution.targetIndex] = currentEntry;
      updated[resolution.targetDayKey] = entries;
      return updated;
    });
    return latestResolution;
  };

  const openEntryEditor = (
    dayKey: string,
    index: number,
    meta: EntryMeta,
    entryData: ScheduleEntry
  ) => {
    const isRecurring = Boolean(
      entryData.repeat && entryData.repeat !== "none"
    );
    const canChooseScope =
      isRecurring &&
      Boolean(meta.originalDayKey) &&
      meta.originalDayKey !== dayKey;

    setActiveEntry({
      dayKey,
      index,
      meta,
      data: {
        time: entryData.time ?? "",
        endTime: entryData.endTime ?? "",
        title: entryData.title ?? "",
        color: entryData.color,
        repeat: entryData.repeat,
        repeatUntil: entryData.repeatUntil ?? null,
        repeatDays: entryData.repeatDays ? [...entryData.repeatDays] : undefined,
        skipDates: entryData.skipDates ? [...entryData.skipDates] : undefined,
      },
      scope: "future",
      canChooseScope,
    });
  };

  const closeEntryEditor = () => setActiveEntry(null);

  const handleActiveFieldChange = (
    field: "time" | "endTime" | "title" | "color" | "repeat",
    value: string
  ) => {
    if (!activeEntry) {
      return;
    }
    const resolution = updateEntry(
      activeEntry.dayKey,
      activeEntry.index,
      field,
      value,
      activeEntry.meta,
      activeEntry.scope
    );
    const nextEntryData = { ...activeEntry.data };
    if (field === "repeat") {
      const repeatValue = value as RepeatFrequency;
      if (repeatValue === "none") {
        nextEntryData.repeat = undefined;
        nextEntryData.repeatUntil = null;
        nextEntryData.repeatDays = undefined;
      } else if (repeatValue === "daily") {
        nextEntryData.repeat = repeatValue;
        if (!nextEntryData.repeatDays || nextEntryData.repeatDays.length === 0) {
          nextEntryData.repeatDays = [...ALL_WEEKDAY_INDICES];
        }
      } else {
        nextEntryData.repeat = repeatValue;
        nextEntryData.repeatDays = undefined;
      }
    } else {
      nextEntryData[field] = value;
    }
    let nextState: EditingEntryState = {
      ...activeEntry,
      data: nextEntryData,
    };
    if (resolution && resolution.targetIndex !== null) {
      nextState = {
        ...nextState,
        dayKey: resolution.targetDayKey,
        index: resolution.targetIndex,
        meta: {
          originalDayKey: resolution.targetDayKey,
          originalEntryIndex: resolution.targetIndex,
        },
      };
      if (activeEntry.meta.originalDayKey !== resolution.targetDayKey) {
        nextState = {
          ...nextState,
          canChooseScope: false,
          scope: "single",
          data: {
            ...nextState.data,
            repeat: undefined,
            repeatUntil: null,
            repeatDays: undefined,
          },
        };
      }
    }
    setActiveEntry(nextState);
  };

  const handleActiveRepeatDaysToggle = (dayIndex: WeekdayIndex) => {
    if (!activeEntry) {
      return;
    }
    const currentDays = activeEntry.data.repeatDays ?? [];
    const hasDay = currentDays.includes(dayIndex);
    const nextDays = hasDay
      ? currentDays.filter((day) => day !== dayIndex)
      : [...currentDays, dayIndex].sort((a, b) => a - b);
    const resolution = updateEntry(
      activeEntry.dayKey,
      activeEntry.index,
      "repeatDays",
      nextDays,
      activeEntry.meta,
      activeEntry.scope
    );
    let nextState: EditingEntryState = {
      ...activeEntry,
      data: {
        ...activeEntry.data,
        repeatDays: nextDays,
      },
    };
    if (resolution && resolution.targetIndex !== null) {
      nextState = {
        ...nextState,
        dayKey: resolution.targetDayKey,
        index: resolution.targetIndex,
        meta: {
          originalDayKey: resolution.targetDayKey,
          originalEntryIndex: resolution.targetIndex,
        },
      };
      if (activeEntry.meta.originalDayKey !== resolution.targetDayKey) {
        nextState = {
          ...nextState,
          canChooseScope: false,
          scope: "single",
          data: {
            ...nextState.data,
            repeat: undefined,
            repeatUntil: null,
            repeatDays: undefined,
          },
        };
      }
    }
    setActiveEntry(nextState);
  };

  const convertEntryToSingleInstance = (
    entry: EditingEntryState
  ): EditingEntryState | null => {
    if (
      !entry.meta.originalDayKey ||
      entry.meta.originalDayKey === entry.dayKey
    ) {
      return entry;
    }
    let latestResolution: EntryResolution | null = null;
    setScheduleEntries((prev) => {
      const resolution = prepareEntriesForMutation(
        prev,
        entry.dayKey,
        entry.index,
        entry.meta,
        "single"
      );
      latestResolution = resolution;
      return resolution.entries;
    });
    if (!latestResolution) {
      return entry;
    }
    const resolutionResult = latestResolution as EntryResolution;
    if (resolutionResult.targetIndex === null) {
      return entry;
    }
    return {
      ...entry,
      dayKey: resolutionResult.targetDayKey,
      index: resolutionResult.targetIndex,
      meta: {
        originalDayKey: resolutionResult.targetDayKey,
        originalEntryIndex: resolutionResult.targetIndex,
      },
      canChooseScope: false,
      scope: "single",
      data: {
        ...entry.data,
        repeat: undefined,
        repeatUntil: null,
        repeatDays: undefined,
      },
    };
  };

  const handleScopeSelection = (scope: "single" | "future") => {
    if (!activeEntry || !activeEntry.canChooseScope || scope === activeEntry.scope) {
      return;
    }
    if (scope === "single" && activeEntry.scope !== "single") {
      const converted = convertEntryToSingleInstance(activeEntry);
      if (converted) {
        setActiveEntry(converted);
      }
      return;
    }
    setActiveEntry({
      ...activeEntry,
      scope,
    });
  };

  const handleDeleteActiveEntry = () => {
    if (!activeEntry) {
      return;
    }
    removeEntry(
      activeEntry.dayKey,
      activeEntry.index,
      activeEntry.meta,
      activeEntry.scope
    );
    setActiveEntry(null);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const getRepeatColor = (title: string, time: string, fallback?: string) => {
    if (fallback) {
      return fallback;
    }
    // Generate a consistent color based on task title and time
    const str = `${title}-${time}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "#8E7DBE", "#F29E4C", "#5DA9E9", "#80CFA9", "#F7B267", "#B8F2E6"
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const getEntriesForDay = (date: Date) => {
    const dayKey = formatDayKey(date);
    type EntryWithMeta = ScheduleEntry & {
      repeatColor?: string;
      originalDayKey: string;
      originalEntryIndex: number;
      isRepeated?: boolean;
    };
    const directEntries: EntryWithMeta[] = (scheduleEntries[dayKey] || []).map(
      (entry, entryIndex) => {
        const base: EntryWithMeta = {
          ...entry,
          originalDayKey: dayKey,
          originalEntryIndex: entryIndex,
        };

        return {
          ...base,
          repeatColor: getRepeatColor(entry.title, entry.time, entry.color),
        };
      }
    );
    const repeatedEntries: EntryWithMeta[] = [];

    // Check all stored entries for repeating tasks
    Object.entries(scheduleEntries).forEach(([storedDayKey, entries]) => {
      if (storedDayKey === dayKey) return; // Skip direct entries, already included

      entries.forEach((entry, entryIdx) => {
        if (!entry.repeat || entry.repeat === "none") return;

        const originalDate = parseDayKey(storedDayKey);
        if (!originalDate) {
          return;
        }
        const repeatEnd = entry.repeatUntil ? parseDayKey(entry.repeatUntil) : null;

        let shouldShow = false;

        const daysDiff = Math.floor(
          (date.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isAfterStart = daysDiff >= 0;

        if (!isAfterStart) {
          shouldShow = false;
        } else if (entry.repeat === "daily") {
          const allowedDays = entry.repeatDays;
          shouldShow =
            !allowedDays ||
            allowedDays.length === 0 ||
            allowedDays.includes(date.getDay() as WeekdayIndex);
        } else if (entry.repeat === "weekly") {
          shouldShow = daysDiff % 7 === 0;
        } else if (entry.repeat === "biweekly") {
          shouldShow = daysDiff % 14 === 0;
        } else if (entry.repeat === "monthly") {
          shouldShow = date.getDate() === originalDate.getDate();
        }

        if (repeatEnd && date > repeatEnd) {
          shouldShow = false;
        }

        if (shouldShow && entry.skipDates && entry.skipDates.includes(dayKey)) {
          shouldShow = false;
        }

        if (shouldShow) {
          repeatedEntries.push({
            ...entry,
            isRepeated: true,
            repeatColor: getRepeatColor(entry.title, entry.time, entry.color),
            originalDayKey: storedDayKey,
            originalEntryIndex: entryIdx,
          } as EntryWithMeta);
        }
      });
    });

    return [...directEntries, ...repeatedEntries];
  };

  const prepareEntriesForMutation = (
    baseEntries: Record<string, ScheduleEntry[]>,
    occurrenceDayKey: string,
    fallbackIndex: number,
    meta?: EntryMeta,
    scope: "single" | "future" = "future"
  ): EntryResolution => {
    const originalDayKey = meta?.originalDayKey ?? occurrenceDayKey;
    const originalEntryIndex =
      meta?.originalEntryIndex ?? fallbackIndex;
    const sourceEntries = baseEntries[originalDayKey];
    const sourceEntry = sourceEntries?.[originalEntryIndex];

    if (!sourceEntry) {
      return {
        entries: baseEntries,
        targetDayKey: originalDayKey,
        targetIndex: null as number | null,
      };
    }

    if (originalDayKey === occurrenceDayKey) {
      return {
        entries: baseEntries,
        targetDayKey: originalDayKey,
        targetIndex: originalEntryIndex,
      };
    }

    if (scope === "single") {
      const updatedEntries = { ...baseEntries };
      const updatedSourceEntries = [...(sourceEntries ?? [])];
      const skipDateSet = new Set(sourceEntry.skipDates ?? []);
      skipDateSet.add(occurrenceDayKey);
      updatedSourceEntries[originalEntryIndex] = {
        ...sourceEntry,
        skipDates: Array.from(skipDateSet),
      };
      updatedEntries[originalDayKey] = updatedSourceEntries;

      const dayEntries = [...(updatedEntries[occurrenceDayKey] ?? [])];
      const clonedEntry: ScheduleEntry = {
        ...sourceEntry,
        repeat: undefined,
        repeatUntil: null,
        repeatDays: undefined,
        skipDates: undefined,
      };
      dayEntries.push(clonedEntry);
      const newIndex = dayEntries.length - 1;
      updatedEntries[occurrenceDayKey] = dayEntries;

      return {
        entries: updatedEntries,
        targetDayKey: occurrenceDayKey,
        targetIndex: newIndex,
      };
    }

    if (scope === "future") {
      const updatedEntries = { ...baseEntries };
      const updatedSourceEntries = [...(sourceEntries ?? [])];
      const previousDayKey = getPreviousDayKey(occurrenceDayKey);
      updatedSourceEntries[originalEntryIndex] = {
        ...sourceEntry,
        repeatUntil: previousDayKey ?? sourceEntry.repeatUntil ?? null,
      };
      updatedEntries[originalDayKey] = updatedSourceEntries;

      const clonedEntry: ScheduleEntry = {
        ...sourceEntry,
        skipDates: sourceEntry.skipDates ? [...sourceEntry.skipDates] : undefined,
      };
      const dayEntries = [...(updatedEntries[occurrenceDayKey] ?? [])];
      dayEntries.push(clonedEntry);
      const newIndex = dayEntries.length - 1;
      updatedEntries[occurrenceDayKey] = dayEntries;

      return {
        entries: updatedEntries,
        targetDayKey: occurrenceDayKey,
        targetIndex: newIndex,
      };
    }

    return {
      entries: baseEntries,
      targetDayKey: originalDayKey,
      targetIndex: originalEntryIndex,
    };
  };

  const handleEntryDragStart = (
    e: React.DragEvent,
    occurrenceDayKey: string,
    storageDayKey: string,
    storageIndex: number,
    entry: ScheduleEntry,
    meta: EntryMeta
  ) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ occurrenceDayKey, storageDayKey, storageIndex, entry, meta })
    );
    setDraggedEntry({ dayKey: storageDayKey, index: storageIndex });
  };

  const executeMoveEntry = (
    occurrenceDayKey: string,
    storageDayKey: string,
    storageIndex: number,
    targetDayKey: string,
    entry: ScheduleEntry,
    meta: EntryMeta,
    scope: "single" | null
  ) => {
    let updatedEntries = { ...scheduleEntries };

    if (scope === "single") {
      // Recurring instance - use prepareEntriesForMutation with the occurrence day
      const { entries: preparedEntries, targetDayKey: newDayKey, targetIndex } =
        prepareEntriesForMutation(
          updatedEntries,
          occurrenceDayKey,
          storageIndex,
          meta,
          scope
        );

      updatedEntries = preparedEntries;

      // Now move the prepared entry
      const entryToMove = targetIndex !== null ? updatedEntries[newDayKey]?.[targetIndex] : null;
      if (entryToMove && targetIndex !== null) {
        // Remove from source
        updatedEntries[newDayKey] = updatedEntries[newDayKey]!.filter(
          (_, i) => i !== targetIndex
        );

        // Strip recurring fields and add to target
        const movedEntry: ScheduleEntry = {
          time: entryToMove.time,
          endTime: entryToMove.endTime,
          title: entryToMove.title,
          color: entryToMove.color,
          // No repeat fields
        };

        updatedEntries[targetDayKey] = [
          ...(updatedEntries[targetDayKey] || []),
          movedEntry,
        ];
      }
    } else {
      // Non-recurring or original entry - direct move
      const sourceEntries = updatedEntries[storageDayKey] || [];
      const entryToMove = sourceEntries[storageIndex];

      if (entryToMove) {
        // Remove from source
        updatedEntries[storageDayKey] = sourceEntries.filter(
          (_, i) => i !== storageIndex
        );

        // Add to target (preserve all fields for original recurring entries)
        updatedEntries[targetDayKey] = [
          ...(updatedEntries[targetDayKey] || []),
          entryToMove,
        ];
      }
    }

    setScheduleEntries(updatedEntries);
  };

  const handleDayDrop = (e: React.DragEvent, targetDayKey: string) => {
    e.preventDefault();

    const dragData = JSON.parse(
      e.dataTransfer.getData("application/json")
    ) as {
      occurrenceDayKey: string;
      storageDayKey: string;
      storageIndex: number;
      entry: ScheduleEntry;
      meta: EntryMeta;
    };

    const { occurrenceDayKey, storageDayKey, storageIndex, entry, meta } = dragData;

    // Don't move to same day
    if (occurrenceDayKey === targetDayKey) {
      setDraggedEntry(null);
      return;
    }

    // Check if this is a repeated instance (not the original)
    // If occurrence day differs from storage day, it's a repeated instance
    const isRepeatedInstance = occurrenceDayKey !== storageDayKey;

    // Auto-use "single" scope for repeated instances, otherwise direct move
    const scope = isRepeatedInstance ? "single" : null;

    // Pass occurrence day to executeMoveEntry so prepareEntriesForMutation knows which date to skip
    executeMoveEntry(occurrenceDayKey, storageDayKey, storageIndex, targetDayKey, entry, meta, scope);
    setDraggedEntry(null);
  };

  const activeEntryDate = activeEntry ? parseDayKey(activeEntry.dayKey) : null;
  const activeEntryRepeatValue: RepeatFrequency =
    activeEntry?.data.repeat ?? "none";
  const activeEntryRepeatDays = activeEntry?.data.repeatDays ?? [];

  return (
    <div className="mx-auto w-full text-left">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-3xl font-light text-foreground">{weekRangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-2xl font-light">
            <button
              type="button"
              onClick={() => handleWeekNavigation(-1)}
              className="rounded-full px-2 py-1 text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:text-foreground"
              aria-label="Previous week"
            >
              ‹
            </button>
            <div className="flex flex-col">
              <input
                type="week"
                value={weekInputValue}
                onChange={handleWeekPickerChange}
                aria-label="Select week"
                className="w-40 rounded-full border border-[color-mix(in_srgb,var(--foreground)_20%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
              />
            </div>
            <button
              type="button"
              onClick={() => handleWeekNavigation(1)}
              className="rounded-full px-2 py-1 text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:text-foreground"
              aria-label="Next week"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => goToWeek(new Date())}
            className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-4 py-2 text-sm transition hover:border-foreground"
          >
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {weekDays.map((date) => {
          const dayKey = formatDayKey(date);
          const entries = getEntriesForDay(date);
          const today = isToday(date);
          const dayLabel = date.toLocaleDateString(undefined, {
            weekday: "short",
          });

          return (
            <div
              key={dayKey}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => handleDayDrop(e, dayKey)}
              className={`group rounded-2xl border py-4 transition ${
                today
                  ? "border-[#60a5fa] bg-transparent shadow-[0_8px_24px_rgba(96,165,250,0.25)]"
                  : "border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-transparent"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-4">
                <div>
                  <p
                    className={`text-xs uppercase tracking-[0.2em] font-semibold ${
                      today
                        ? "text-[#1d4ed8]"
                        : "text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
                    }`}
                  >
                    {dayLabel}
                  </p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      today
                        ? "text-[#1d4ed8]"
                        : "text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                    }`}
                  >
                    {date.getDate()}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => addEntry(dayKey)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-xs opacity-0 transition hover:border-foreground group-hover:opacity-100"
                    aria-label="Add task"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-2 px-2">
                {entries
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((entry, entryIdx) => {
                    const repeatColor = "repeatColor" in entry ? entry.repeatColor : null;
                    const originalDayKey =
                      "originalDayKey" in entry ? (entry.originalDayKey as string) : dayKey;
                    const originalEntryIndex =
                      "originalEntryIndex" in entry ? (entry.originalEntryIndex as number) : entryIdx;
                    const meta: EntryMeta = {
                      originalDayKey,
                      originalEntryIndex,
                    };

                    // Calculate duration in minutes for proportional height
                    const calculateDuration = (start: string, end: string | undefined): number => {
                      if (!end) return 60; // Default 1 hour if no end time
                      const [startHour, startMin] = start.split(':').map(Number);
                      const [endHour, endMin] = end.split(':').map(Number);
                      const startMinutes = startHour * 60 + startMin;
                      const endMinutes = endHour * 60 + endMin;
                      return Math.max(30, endMinutes - startMinutes); // Minimum 30 minutes
                    };

                    const durationMinutes = calculateDuration(entry.time, entry.endTime);
                    // Base height: 60px per hour, minimum 40px
                    const heightPx = Math.max(40, (durationMinutes / 60) * 60);

                    return (
                      <div
                        key={`${dayKey}-${entryIdx}`}
                        className="group rounded-lg pb-0 pt-1"
                        style={{
                          backgroundColor: repeatColor
                            ? `color-mix(in srgb, ${repeatColor} 12%, transparent)`
                            : "color-mix(in srgb, var(--foreground) 3%, transparent)",
                          minHeight: `${heightPx}px`,
                        }}
                      >
                        <button
                          type="button"
                          draggable={true}
                          onDragStart={(e) => handleEntryDragStart(e, dayKey, originalDayKey, originalEntryIndex, entry, meta)}
                          onDragEnd={() => setDraggedEntry(null)}
                          onClick={() => openEntryEditor(dayKey, entryIdx, meta, entry)}
                          className={`flex h-full w-full flex-col justify-between rounded-md px-2 py-2 text-left transition hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] focus:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] focus:outline-none ${
                            draggedEntry?.dayKey === originalDayKey && draggedEntry?.index === originalEntryIndex
                              ? "opacity-50"
                              : ""
                          }`}
                        >
                          <div>
                            <div className="mb-1 text-xs text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
                              {entry.time || "—"}
                              {entry.endTime
                                ? ` – ${entry.endTime}`
                                : ""}
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              {entry.title || "Untitled task"}
                            </p>
                          </div>
                        </button>
                        <div className="flex justify-end px-2">
                          <button
                            type="button"
                            onClick={() => removeEntry(dayKey, entryIdx, meta)}
                            className="text-xs text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                            aria-label="Delete task"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {entries.length === 0 && (
                <p className="px-4 text-center text-xs text-[color-mix(in_srgb,var(--foreground)_40%,transparent)]">
                  No tasks
                </p>
              )}
            </div>
          );
        })}
      </div>

      {activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={closeEntryEditor}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)]">
                  Edit task
                </p>
                <p className="text-lg font-light text-foreground">
                  {activeEntryDate
                    ? activeEntryDate.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                      })
                    : activeEntry.dayKey}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEntryEditor}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
              >
                ✕
              </button>
            </div>

            {activeEntry.canChooseScope && (
              <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  Apply changes to
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <label className="flex items-center gap-2 text-foreground">
                    <input
                      type="radio"
                      name="entry-scope"
                      value="single"
                      checked={activeEntry.scope === "single"}
                      onChange={() => handleScopeSelection("single")}
                      className="h-4 w-4 accent-foreground"
                    />
                    This task only
                  </label>
                  <label className="flex items-center gap-2 text-foreground">
                    <input
                      type="radio"
                      name="entry-scope"
                      value="future"
                      checked={activeEntry.scope === "future"}
                      onChange={() => handleScopeSelection("future")}
                      className="h-4 w-4 accent-foreground"
                    />
                    This and future tasks
                  </label>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  Start
                  <input
                    type="time"
                    step={1800}
                    list="time-select-options"
                    value={activeEntry.data.time ?? TIME_OPTIONS[0]}
                    onChange={(event) =>
                      handleActiveFieldChange("time", event.target.value)
                    }
                    className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                  />
                </label>
                <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  End
                  <input
                    type="time"
                    step={1800}
                    list="time-select-options"
                    value={activeEntry.data.endTime ?? TIME_OPTIONS[0]}
                    onChange={(event) =>
                      handleActiveFieldChange("endTime", event.target.value)
                    }
                    className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                  />
                </label>
              </div>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                Title
                <input
                  type="text"
                  value={activeEntry.data.title}
                  onChange={(event) =>
                    handleActiveFieldChange("title", event.target.value)
                  }
                  placeholder="Task title"
                  className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                />
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                Accent color
                <input
                  type="color"
                  value={activeEntry.data.color ?? "#8E7DBE"}
                  onChange={(event) =>
                    handleActiveFieldChange("color", event.target.value)
                  }
                  className="mt-1 h-10 w-full cursor-pointer rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-3 py-1.5"
                />
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                Repeat
                <select
                  value={activeEntryRepeatValue}
                  onChange={(event) =>
                    handleActiveFieldChange("repeat", event.target.value)
                  }
                  className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
                {activeEntryRepeatValue === "daily" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {WEEKDAY_SHORT_LABELS.map((label, dayIndex) => {
                      const index = dayIndex as WeekdayIndex;
                      const isActive = activeEntryRepeatDays.includes(index);
                      return (
                        <button
                          key={`repeat-day-${label}`}
                          type="button"
                          onClick={() => handleActiveRepeatDaysToggle(index)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isActive
                              ? "border-foreground text-foreground"
                              : "border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDeleteActiveEntry}
                className="text-sm text-[#f87171] transition hover:text-[#ef4444]"
              >
                Delete task
              </button>
              <button
                type="button"
                onClick={closeEntryEditor}
                className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-4 py-2 text-sm transition hover:border-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
