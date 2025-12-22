"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { UserInfo } from "./components/UserInfo";
import { migrateFromLocalStorage } from "@/lib/migrate";
import {
  loadAllData,
  saveGoals,
  saveSchedule,
  saveProductivity,
  saveWeeklyNotes,
  saveDayOffs,
  saveProfile
} from "@/lib/api";
import { APP_NAME, legacyStorageKey, storageKey } from "@/lib/branding";
import {
  filterRecentScheduleEntries,
  safeLocalStorageSetItem,
  cleanupOldScheduleEntries,
  emergencyCleanup,
} from "@/lib/localStorage-utils";
import {
  demoScheduleEntries,
  demoProductivityRatings,
  demoGoals,
  demoWeeklyNoteTemplate,
  demoProfile,
} from "@/lib/demo-data";

type Theme = "light" | "dark";

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

type ShareListItem = {
  id: string;
  recipientEmail?: string;
  owner?: { email?: string | null; profile?: { personName?: string | null } | null };
  recipientUser?: { email?: string | null };
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

const DEFAULT_ENTRY_START = "09:00";
const DEFAULT_ENTRY_DURATION_MINUTES = 60;

const timeStringToMinutes = (time: string | undefined | null): number | null => {
  if (!time) return null;
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const minutesToTimeString = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 30));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const nextEntryTimes = (entries: ScheduleEntry[]): { start: string; end: string } => {
  const lastEntry = entries[entries.length - 1];
  const defaultStartMinutes =
    timeStringToMinutes(lastEntry?.endTime ?? lastEntry?.time ?? DEFAULT_ENTRY_START) ??
    timeStringToMinutes(DEFAULT_ENTRY_START)!;
  const startMinutes = Math.min(defaultStartMinutes, 23 * 60 + 30);
  const proposedEnd = startMinutes + DEFAULT_ENTRY_DURATION_MINUTES;
  const endMinutes = Math.max(startMinutes + 30, Math.min(proposedEnd, 24 * 60));
  return {
    start: minutesToTimeString(startMinutes),
    end: minutesToTimeString(endMinutes),
  };
};

const getRepeatColor = (title: string, time: string, fallback?: string) => {
  if (fallback) {
    return fallback;
  }
  const str = `${title}-${time}`;
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "#8E7DBE",
    "#F29E4C",
    "#5DA9E9",
    "#80CFA9",
    "#F7B267",
    "#B8F2E6",
  ];
  return colors[Math.abs(hash) % colors.length];
};

const createEntryWithColor = (
  entry: ScheduleEntry
): ScheduleEntry => {
  if (entry.color) {
    return entry;
  }
  return {
    ...entry,
    color: getRepeatColor(entry.title ?? "", entry.time ?? DEFAULT_ENTRY_START),
  };
};

const normalizeScheduleEntryColors = (
  entries: Record<string, ScheduleEntry[]>
): Record<string, ScheduleEntry[]> => {
  let mutated = false;
  const normalized: Record<string, ScheduleEntry[]> = {};
  Object.entries(entries).forEach(([dayKey, dayEntries]) => {
    let dayMutated = false;
    const updatedDayEntries = dayEntries.map((entry) => {
      if (entry.color) {
        return entry;
      }
      dayMutated = true;
      return createEntryWithColor(entry);
    });
    if (dayMutated) {
      mutated = true;
    }
    normalized[dayKey] = dayMutated ? updatedDayEntries : dayEntries;
  });
  return mutated ? normalized : entries;
};

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

type ViewMode = "life" | "productivity";

type KeyResultStatus = "on-hold" | "started" | "completed";

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
  archived?: boolean;
};

type WeeklyNoteEntry = {
  content: string;
  dos: string;
  donts: string;
};

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";
type ProductivityScaleEntry = {
  value: number;
  label: string;
  color: string;
};

const PRODUCTIVITY_SCALE_THREE: ProductivityScaleEntry[] = [
  { value: 0, label: "<25%", color: "productivity-low" },
  { value: 1, label: "25-50%", color: "productivity-medium" },
  { value: 2, label: ">50%", color: "productivity-high" },
];

const PRODUCTIVITY_SCALE_FOUR: ProductivityScaleEntry[] = [
  { value: 0, label: "<25%", color: "productivity-low" },
  { value: 1, label: "25-50%", color: "productivity-medium" },
  { value: 2, label: "50-75%", color: "productivity-high" },
  { value: 3, label: ">75%", color: "productivity-top" },
];

type WeekMeta = {
  weekNumber: number;
  months: number[];
  dayKeys: string[];
  primaryMonth: number;
  rangeLabel: string;
  weekKey: string;
  weekStart: Date;
};

const getWeekStart = (date: Date, weekStartDay: WeekdayIndex = 1) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const formatDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const formatWeekKey = (weekStart: Date, weekStartDay: WeekdayIndex) =>
  `week-${weekStartDay}-${formatDayKey(weekStart)}`;

const parseWeekKey = (key: string): { weekStart: Date; weekStartDay: WeekdayIndex } | null => {
  const match = /^week-(\d)-(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!match) {
    return null;
  }
  const [, weekStartDayStr, yearStr, monthStr, dayStr] = match;
  const weekStartDay = Number(weekStartDayStr);
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isFinite(weekStartDay) ||
    weekStartDay < 0 ||
    weekStartDay > 6 ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return { weekStart: parsed, weekStartDay: weekStartDay as WeekdayIndex };
};

const isLegacyWeekKey = (key: string) =>
  /^week-(\d{4})-(\d{1,2})-(\d{1,2})$/.test(key);

const normalizeWeeklyGoalsTemplate = (template: string) => {
  if (/<[^>]+>/.test(template)) {
    return template;
  }
  const normalized = template
    .replace(/^\s*What I want to accomplish this week:\s*/i, "")
    .replace(/\s*-\s*/g, "\n- ")
    .trim();
  const heading = "What I want to accomplish this week:";
  const lines = normalized ? normalized.split(/\r?\n/) : [];
  const listItems = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => `<li>${line.slice(2).trim()}</li>`)
    .join("");
  const listBlock = listItems ? `<ul>${listItems}</ul>` : "";
  return `<p><strong>${heading}</strong></p>${listBlock}`;
};


const remapWeekKeys = <T,>(
  entries: Record<string, T>,
  nextWeekStartDay: WeekdayIndex
): Record<string, T> => {
  const remapped: Record<string, T> = {};
  for (const [key, value] of Object.entries(entries)) {
    const parsed = parseWeekKey(key);
    if (parsed) {
      // Anchor to mid-week so switching start day shifts forward/backward intuitively.
      const anchor = new Date(parsed.weekStart);
      anchor.setDate(anchor.getDate() + 3);
      const nextWeekStart = getWeekStart(anchor, nextWeekStartDay);
      const nextKey = formatWeekKey(nextWeekStart, nextWeekStartDay);
      remapped[nextKey] = value;
      continue;
    }
    remapped[key] = value;
  }
  return remapped;
};

const migrateWeekKeys = <T,>(
  entries: Record<string, T>,
  weekStartDay: WeekdayIndex
): { migrated: Record<string, T>; didMigrate: boolean } => {
  const migrated: Record<string, T> = {};
  let didMigrate = false;

  for (const [key, value] of Object.entries(entries)) {
    if (isLegacyWeekKey(key)) {
      const nextKey = `week-${weekStartDay}-${key.slice("week-".length)}`;
      if (!(nextKey in migrated)) {
        migrated[nextKey] = value;
      }
      didMigrate = true;
      continue;
    }
    if (!(key in migrated)) {
      migrated[key] = value;
    }
  }

  return { migrated, didMigrate };
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

const buildWeeksForYear = (year: number, weekStartDay: WeekdayIndex): WeekMeta[] => {
  const weeks: WeekMeta[] = [];
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  let currentStart = getWeekStart(yearStart, weekStartDay);
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
        weekKey: formatWeekKey(weekStart, weekStartDay),
        weekStart: new Date(weekStart),
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
  const [isShareEditorVisible, setIsShareEditorVisible] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [recentYears, setRecentYears] = useState<string>("10");
  const [view, setView] = useState<ViewMode>(() => {
    // Initialize from localStorage if available
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("timespent-active-view");
      if (stored === "productivity") {
        return stored;
      }
      if (stored === "life") {
        return "productivity";
      }
    }
    return "productivity";
  });
  const [productivityYear, setProductivityYear] = useState(() =>
    new Date().getFullYear()
  );
  const [weekStartDay, setWeekStartDay] = useState<WeekdayIndex>(1);
  const weeksForYear = useMemo(
    () => buildWeeksForYear(productivityYear, weekStartDay),
    [productivityYear, weekStartDay]
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [productivityRatings, setProductivityRatings] = useState<
    Record<string, number | null>
  >({});
  const [productivityGoals, setProductivityGoals] = useState<
    Record<number, string>
  >({});
  const [showLegend, setShowLegend] = useState(true);
  const [weeklyGoalsTemplate, setWeeklyGoalsTemplate] = useState(
    "<p><strong>What I want to accomplish this week:</strong></p><ul><li>Monday</li><li>Tuesday</li><li>Wednesday</li><li>Thursday</li><li>Friday</li><li>Saturday</li><li>Sunday</li></ul>"
  );
  const [dayOffAllowance, setDayOffAllowance] = useState(15);
  const [dayOffs, setDayOffs] = useState<Record<string, boolean>>({});
  const [isDayOffMode, setIsDayOffMode] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<ShareListItem[]>([]);
  const [sharedByMe, setSharedByMe] = useState<ShareListItem[]>([]);
  const [productivityMode, setProductivityMode] =
    useState<"day" | "week">("week");
  const [productivityScaleMode, setProductivityScaleMode] =
    useState<"3" | "4">("3");
  const productivityScale = useMemo(
    () => (productivityScaleMode === "4" ? PRODUCTIVITY_SCALE_FOUR : PRODUCTIVITY_SCALE_THREE),
    [productivityScaleMode]
  );
  const dayOffsUsed = useMemo(() => {
    return Object.keys(dayOffs).reduce((count, key) => {
      const [yearPart] = key.split("-");
      const year = Number(yearPart);
      if (Number.isFinite(year) && year === productivityYear) {
        return count + 1;
      }
      return count;
    }, 0);
  }, [dayOffs, productivityYear]);
  const dayOffsRemaining = Math.max(0, dayOffAllowance - dayOffsUsed);
  const [scheduleEntries, setScheduleEntries] = useState<
    Record<string, ScheduleEntry[]>
  >({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [archivedGoals, setArchivedGoals] = useState<Goal[]>([]);
  const [isViewingArchived, setIsViewingArchived] = useState(false);
  const [goalsSectionTitle, setGoalsSectionTitle] = useState("2026 GOALS");
  const [isEditingGoalsSectionTitle, setIsEditingGoalsSectionTitle] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [krDrafts, setKrDrafts] = useState<Record<string, { title: string }>>({});
  const [activeKrDraftGoalId, setActiveKrDraftGoalId] = useState<string | null>(null);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [goalFieldDrafts, setGoalFieldDrafts] = useState<
    Record<string, { title?: string }>
  >({});
  const [activeGoalFieldEdit, setActiveGoalFieldEdit] = useState<{
    goalId: string;
    field: "title";
  } | null>(null);
  const [krFieldDrafts, setKrFieldDrafts] = useState<
    Record<string, { title?: string }>
  >({});
  const [activeKrFieldEdit, setActiveKrFieldEdit] = useState<{
    goalId: string;
    krId: string;
    field: "title";
  } | null>(null);
  const [activeGoalCardId, setActiveGoalCardId] = useState<string | null>(null);
  const okrCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [weeklyNotes, setWeeklyNotes] = useState<Record<string, WeeklyNoteEntry>>({});
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const lastWeekStartDayRef = useRef<WeekdayIndex | null>(null);
  const dosTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dontsTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const goalsSectionRef = useRef<HTMLDivElement | null>(null);
  const lastProcessedScheduleRef = useRef<string | null>(null);
  const pendingScheduleRef = useRef<Record<string, ScheduleEntry[]>>({});
  const scheduleSaveTimeoutRef = useRef<number | null>(null);
  const isSavingScheduleRef = useRef(false);
  const lastServerSavedScheduleRef = useRef<string | null>(null);
  const lastProcessedGoalsRef = useRef<string | null>(null);
  const pendingGoalsRef = useRef<Goal[]>([]);
  const goalsSaveTimeoutRef = useRef<number | null>(null);
  const isSavingGoalsRef = useRef(false);
  const lastServerSavedGoalsRef = useRef<string | null>(null);
  const lastProcessedProductivityRef = useRef<string | null>(null);
  const pendingProductivityRef = useRef<Record<string, number | null>>({});
  const productivitySaveTimeoutRef = useRef<number | null>(null);
  const isSavingProductivityRef = useRef(false);
  const lastServerSavedProductivityRef = useRef<string | null>(null);
  const lastProcessedWeeklyNotesRef = useRef<string | null>(null);
  const pendingWeeklyNotesRef = useRef<Record<string, WeeklyNoteEntry>>({});
  const weeklyNotesSaveTimeoutRef = useRef<number | null>(null);
  const isSavingWeeklyNotesRef = useRef(false);
  const lastServerSavedWeeklyNotesRef = useRef<string | null>(null);
  const lastProcessedDayOffsRef = useRef<string | null>(null);
  const pendingDayOffsRef = useRef<Record<string, boolean>>({});
  const dayOffsSaveTimeoutRef = useRef<number | null>(null);
  const isSavingDayOffsRef = useRef(false);
  const lastServerSavedDayOffsRef = useRef<string | null>(null);
  const lastServerSavedProfileRef = useRef<string | null>(null);
  const hasLoadedServerDataRef = useRef(false);

  const triggerScheduleSave = useCallback(() => {
    if (!userEmail || isDemoMode) {
      return;
    }

    const pendingSerialized = JSON.stringify(pendingScheduleRef.current ?? {});
    if (lastServerSavedScheduleRef.current === pendingSerialized) {
      return;
    }

    if (isSavingScheduleRef.current) {
      return;
    }

    const dataToSave = pendingScheduleRef.current;
    const serializedToSave = pendingSerialized;

    isSavingScheduleRef.current = true;
    void (async () => {
      try {
        await saveSchedule(dataToSave);
        lastServerSavedScheduleRef.current = serializedToSave;
      } catch (error) {
        console.error("Failed to persist schedule", error);
      } finally {
        isSavingScheduleRef.current = false;
        const latestSerialized = JSON.stringify(pendingScheduleRef.current ?? {});
        if (
          userEmail &&
          !isDemoMode &&
          latestSerialized !== serializedToSave &&
          !scheduleSaveTimeoutRef.current
        ) {
          scheduleSaveTimeoutRef.current = window.setTimeout(() => {
            scheduleSaveTimeoutRef.current = null;
            triggerScheduleSave();
          }, 200);
        }
      }
    })();
  }, [userEmail, isDemoMode]);

  const triggerGoalsSave = useCallback(() => {
    if (!userEmail || isDemoMode) {
      return;
    }

    const pendingSerialized = JSON.stringify(pendingGoalsRef.current ?? []);
    if (lastServerSavedGoalsRef.current === pendingSerialized) {
      return;
    }

    if (isSavingGoalsRef.current) {
      return;
    }

    const dataToSave = pendingGoalsRef.current;

    // Safety check: Don't save if goals data looks incomplete
    // This prevents accidentally wiping keyResults
    if (!dataToSave || dataToSave.length === 0) {
      return;
    }

    const serializedToSave = pendingSerialized;

    isSavingGoalsRef.current = true;
    void (async () => {
      try {
        await saveGoals(dataToSave);
        lastServerSavedGoalsRef.current = serializedToSave;
      } catch (error) {
        console.error("Failed to persist goals", error);
      } finally {
        isSavingGoalsRef.current = false;
        const latestSerialized = JSON.stringify(pendingGoalsRef.current ?? []);
        if (
          userEmail &&
          !isDemoMode &&
          latestSerialized !== serializedToSave &&
          !goalsSaveTimeoutRef.current
        ) {
          goalsSaveTimeoutRef.current = window.setTimeout(() => {
            goalsSaveTimeoutRef.current = null;
            triggerGoalsSave();
          }, 200);
        }
      }
    })();
  }, [userEmail, isDemoMode]);

  const saveGoalsNow = useCallback((nextGoals: Goal[]) => {
    if (!userEmail || isDemoMode || !hasLoadedServerDataRef.current) {
      return;
    }

    pendingGoalsRef.current = nextGoals;

    if (goalsSaveTimeoutRef.current) {
      window.clearTimeout(goalsSaveTimeoutRef.current);
      goalsSaveTimeoutRef.current = null;
    }

    triggerGoalsSave();
  }, [userEmail, isDemoMode, triggerGoalsSave]);

  const triggerProductivitySave = useCallback(() => {
    if (!userEmail || isDemoMode) {
      return;
    }

    const pendingSerialized = JSON.stringify(pendingProductivityRef.current ?? {});
    if (lastServerSavedProductivityRef.current === pendingSerialized) {
      return;
    }

    if (isSavingProductivityRef.current) {
      return;
    }

    const dataToSave = pendingProductivityRef.current;
    const serializedToSave = pendingSerialized;

    isSavingProductivityRef.current = true;
    void (async () => {
      try {
        await saveProductivity(dataToSave);
        lastServerSavedProductivityRef.current = serializedToSave;
      } catch (error) {
        console.error("Failed to persist productivity ratings", error);
      } finally {
        isSavingProductivityRef.current = false;
        const latestSerialized = JSON.stringify(pendingProductivityRef.current ?? {});
        if (
          userEmail &&
          !isDemoMode &&
          latestSerialized !== serializedToSave &&
          !productivitySaveTimeoutRef.current
        ) {
          productivitySaveTimeoutRef.current = window.setTimeout(() => {
            productivitySaveTimeoutRef.current = null;
            triggerProductivitySave();
          }, 200);
        }
      }
    })();
  }, [userEmail, isDemoMode]);

  const triggerWeeklyNotesSave = useCallback(() => {
    if (!userEmail || isDemoMode) {
      return;
    }

    const pendingSerialized = JSON.stringify(pendingWeeklyNotesRef.current ?? {});
    if (lastServerSavedWeeklyNotesRef.current === pendingSerialized) {
      return;
    }

    if (isSavingWeeklyNotesRef.current) {
      return;
    }

    const dataToSave = pendingWeeklyNotesRef.current;
    const serializedToSave = pendingSerialized;

    isSavingWeeklyNotesRef.current = true;
    void (async () => {
      try {
        await saveWeeklyNotes(dataToSave);
        lastServerSavedWeeklyNotesRef.current = serializedToSave;
      } catch (error) {
        console.error("Failed to persist weekly notes", error);
      } finally {
        isSavingWeeklyNotesRef.current = false;
        const latestSerialized = JSON.stringify(pendingWeeklyNotesRef.current ?? {});
        if (
          userEmail &&
          !isDemoMode &&
          latestSerialized !== serializedToSave &&
          !weeklyNotesSaveTimeoutRef.current
        ) {
          weeklyNotesSaveTimeoutRef.current = window.setTimeout(() => {
            weeklyNotesSaveTimeoutRef.current = null;
            triggerWeeklyNotesSave();
          }, 200);
        }
      }
    })();
  }, [userEmail, isDemoMode]);

  const triggerDayOffsSave = useCallback(() => {
    if (!userEmail || isDemoMode) {
      return;
    }

    const pendingSerialized = JSON.stringify(pendingDayOffsRef.current ?? {});
    if (lastServerSavedDayOffsRef.current === pendingSerialized) {
      return;
    }

    if (isSavingDayOffsRef.current) {
      return;
    }

    const dataToSave = pendingDayOffsRef.current;
    const serializedToSave = pendingSerialized;

    isSavingDayOffsRef.current = true;
    void (async () => {
      try {
        await saveDayOffs(dataToSave);
        lastServerSavedDayOffsRef.current = serializedToSave;
      } catch (error) {
        console.error("Failed to persist day offs", error);
      } finally {
        isSavingDayOffsRef.current = false;
        const latestSerialized = JSON.stringify(pendingDayOffsRef.current ?? {});
        if (
          userEmail &&
          !isDemoMode &&
          latestSerialized !== serializedToSave &&
          !dayOffsSaveTimeoutRef.current
        ) {
          dayOffsSaveTimeoutRef.current = window.setTimeout(() => {
            dayOffsSaveTimeoutRef.current = null;
            triggerDayOffsSave();
          }, 200);
        }
      }
    })();
  }, [userEmail, isDemoMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    lastServerSavedScheduleRef.current = null;
    pendingScheduleRef.current = {};
    lastProcessedScheduleRef.current = null;
    if (scheduleSaveTimeoutRef.current) {
      window.clearTimeout(scheduleSaveTimeoutRef.current);
      scheduleSaveTimeoutRef.current = null;
    }
    lastServerSavedGoalsRef.current = null;
    pendingGoalsRef.current = [];
    lastProcessedGoalsRef.current = null;
    if (goalsSaveTimeoutRef.current) {
      window.clearTimeout(goalsSaveTimeoutRef.current);
      goalsSaveTimeoutRef.current = null;
    }
    lastServerSavedProductivityRef.current = null;
    pendingProductivityRef.current = {};
    lastProcessedProductivityRef.current = null;
    if (productivitySaveTimeoutRef.current) {
      window.clearTimeout(productivitySaveTimeoutRef.current);
      productivitySaveTimeoutRef.current = null;
    }
    lastServerSavedWeeklyNotesRef.current = null;
    pendingWeeklyNotesRef.current = {};
    lastProcessedWeeklyNotesRef.current = null;
    if (weeklyNotesSaveTimeoutRef.current) {
      window.clearTimeout(weeklyNotesSaveTimeoutRef.current);
      weeklyNotesSaveTimeoutRef.current = null;
    }
    lastServerSavedDayOffsRef.current = null;
    pendingDayOffsRef.current = {};
    lastProcessedDayOffsRef.current = null;
    if (dayOffsSaveTimeoutRef.current) {
      window.clearTimeout(dayOffsSaveTimeoutRef.current);
      dayOffsSaveTimeoutRef.current = null;
    }
    hasLoadedServerDataRef.current = false;
    lastServerSavedProfileRef.current = null;
  }, [userEmail]);

  const fetchShares = useCallback(async () => {
    if (!userEmail) {
      return;
    }
    setIsLoadingShares(true);
    setShareError(null);
    try {
      const response = await fetch("/api/shares");
      if (!response.ok) {
        throw new Error("Failed to load shares");
      }
      const data = await response.json();
      setSharedWithMe(data.sharedWithMe ?? []);
      setSharedByMe(data.sharedByMe ?? []);
    } catch (error) {
      setShareError("Unable to load shares right now.");
    } finally {
      setIsLoadingShares(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (isEditingProfile || isShareEditorVisible) {
      void fetchShares();
    }
  }, [isEditingProfile, isShareEditorVisible, fetchShares]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    async function loadData() {
      let shouldOpenProfileModal: boolean | null = null;
      let hasProfileLegend = false;
      let hasProfileWeeklyTemplate = false;
      try {
        // Check session first
        const sessionRes = await fetch("/api/auth/session");
        const sessionContentType = sessionRes.headers.get("content-type") || "";
        const session = sessionContentType.includes("application/json")
          ? await sessionRes.json()
          : null;

        const isLoggedIn = !!session?.user?.email;
        setUserEmail(session?.user?.email || null);

        if (isLoggedIn) {
          setIsDemoMode(false);
          try {
            window.localStorage.setItem("timespent-demo-mode", "false");
          } catch (error) {
            console.error("Failed to update demo mode flag", error);
          }
          // Logged in - load from database
          await migrateFromLocalStorage();
          cleanupOldScheduleEntries();

          const data = await loadAllData();

          if (data) {
            // Remove duplicate goals (same title, case-insensitive)
            const uniqueGoals = (data.goals ?? []).reduce((acc: Goal[], goal: Goal) => {
              const isDuplicate = acc.some(g => g.title.toLowerCase() === goal.title.toLowerCase());
              if (!isDuplicate) {
                // Ensure archived field exists with default value
                acc.push({ ...goal, archived: goal.archived ?? false });
              }
              return acc;
            }, []);
            setGoals(uniqueGoals);
            const serializedGoals = JSON.stringify(uniqueGoals);
            lastProcessedGoalsRef.current = serializedGoals;
            lastServerSavedGoalsRef.current = serializedGoals;
            pendingGoalsRef.current = uniqueGoals;

            const normalizedSchedule = normalizeScheduleEntryColors(data.scheduleEntries ?? {});
            setScheduleEntries(normalizedSchedule);
            const serializedSchedule = JSON.stringify(normalizedSchedule);
            lastProcessedScheduleRef.current = serializedSchedule;
            lastServerSavedScheduleRef.current = serializedSchedule;
            pendingScheduleRef.current = normalizedSchedule;

            // Set profile data
            const profile = data.profile;
            let nextWeekStartDay: WeekdayIndex = 1;
            let nextRecentYears = recentYears;
            let nextGoalsSectionTitle = goalsSectionTitle;
            let nextPersonName = "";
            let nextDateOfBirth = "";
            let nextProductivityScaleMode: "3" | "4" = productivityScaleMode;
            let nextShowLegend = showLegend;
            let nextWeeklyGoalsTemplate = weeklyGoalsTemplate;
            let nextDayOffAllowance = dayOffAllowance;

            if (profile) {
              nextPersonName = profile.personName ?? "";
              nextDateOfBirth = profile.dateOfBirth ?? "";
              setPersonName(nextPersonName);
              setDateOfBirth(nextDateOfBirth);
              if (profile.weekStartDay !== undefined) {
                nextWeekStartDay = profile.weekStartDay as WeekdayIndex;
              }
              setWeekStartDay(nextWeekStartDay);
              if (profile.showLegend !== undefined) {
                nextShowLegend = Boolean(profile.showLegend);
                setShowLegend(nextShowLegend);
                hasProfileLegend = true;
              }
              if (profile.weeklyGoalsTemplate) {
                nextWeeklyGoalsTemplate = normalizeWeeklyGoalsTemplate(profile.weeklyGoalsTemplate);
                setWeeklyGoalsTemplate(nextWeeklyGoalsTemplate);
                hasProfileWeeklyTemplate = true;
              }
              if (profile.dayOffAllowance !== undefined && profile.dayOffAllowance !== null) {
                nextDayOffAllowance = Number(profile.dayOffAllowance);
                setDayOffAllowance(nextDayOffAllowance);
              }
              if (profile.recentYears) {
                nextRecentYears = profile.recentYears;
                setRecentYears(nextRecentYears);
              }
              if (profile.goalsSectionTitle) {
                nextGoalsSectionTitle = profile.goalsSectionTitle;
                setGoalsSectionTitle(nextGoalsSectionTitle);
              }
              if (profile.productivityViewMode !== undefined) {
                setProductivityMode(profile.productivityViewMode as "day" | "week");
              }
              if (profile.productivityScaleMode === "3" || profile.productivityScaleMode === "4") {
                nextProductivityScaleMode = profile.productivityScaleMode;
                setProductivityScaleMode(nextProductivityScaleMode);
              }

              const complete = Boolean(profile.personName);
              shouldOpenProfileModal = !complete;
            } else {
              setWeekStartDay(1);
            }

            const migrationKey = `timespent-weekkey-migration-done-${session?.user?.email ?? "unknown"}`;
            const hasMigratedWeekKeys =
              window.localStorage.getItem(migrationKey) === "true";

            const productivityData = data.productivityRatings ?? {};
            const migratedProductivity = hasMigratedWeekKeys
              ? { migrated: productivityData, didMigrate: false }
              : migrateWeekKeys(productivityData, nextWeekStartDay);
            setProductivityRatings(migratedProductivity.migrated);
            const serializedProductivity = JSON.stringify(migratedProductivity.migrated);
            lastProcessedProductivityRef.current = migratedProductivity.didMigrate ? null : serializedProductivity;
            lastServerSavedProductivityRef.current = migratedProductivity.didMigrate ? null : serializedProductivity;
            pendingProductivityRef.current = migratedProductivity.migrated;

            const weeklyNotesData = data.weeklyNotes ?? {};
            const migratedWeekly = hasMigratedWeekKeys
              ? { migrated: weeklyNotesData, didMigrate: false }
              : migrateWeekKeys(weeklyNotesData, nextWeekStartDay);
            const normalizedWeekly = normalizeWeeklyNotes(migratedWeekly.migrated);
            setWeeklyNotes(normalizedWeekly);
            const serializedWeekly = JSON.stringify(normalizedWeekly);
            lastProcessedWeeklyNotesRef.current = migratedWeekly.didMigrate ? null : serializedWeekly;
            lastServerSavedWeeklyNotesRef.current = migratedWeekly.didMigrate ? null : serializedWeekly;
            pendingWeeklyNotesRef.current = normalizedWeekly;

            const dayOffsData = data.dayOffs ?? {};
            setDayOffs(dayOffsData);
            const serializedDayOffs = JSON.stringify(dayOffsData);
            lastProcessedDayOffsRef.current = serializedDayOffs;
            lastServerSavedDayOffsRef.current = serializedDayOffs;
            pendingDayOffsRef.current = dayOffsData;

            if (migratedProductivity.didMigrate || migratedWeekly.didMigrate) {
              window.localStorage.setItem(migrationKey, "true");
            }

            const profilePayload = {
              personName: nextPersonName.trim() ? nextPersonName : null,
              dateOfBirth: nextDateOfBirth.trim() ? nextDateOfBirth : null,
              weekStartDay: nextWeekStartDay,
              recentYears: nextRecentYears,
              goalsSectionTitle: nextGoalsSectionTitle,
              productivityScaleMode: nextProductivityScaleMode,
              showLegend: nextShowLegend,
              weeklyGoalsTemplate: nextWeeklyGoalsTemplate,
              dayOffAllowance: nextDayOffAllowance
            };
            lastServerSavedProfileRef.current = JSON.stringify(profilePayload);
          }
          hasLoadedServerDataRef.current = true;
        } else {
          setIsDemoMode(true);
          try {
            window.localStorage.setItem("timespent-demo-mode", "true");
          } catch (error) {
            console.error("Failed to update demo mode flag", error);
          }
          // Guest - load demo data
          setGoals(demoGoals);
          setScheduleEntries(normalizeScheduleEntryColors(demoScheduleEntries));
          setProductivityRatings(demoProductivityRatings);
          setWeeklyNotes(
            normalizeWeeklyNotes(
              buildDemoWeeklyNotes(new Date().getFullYear(), demoProfile.weekStartDay as WeekdayIndex)
            )
          );
          setPersonName(demoProfile.personName);
          setDateOfBirth(demoProfile.dateOfBirth);
          setWeekStartDay(demoProfile.weekStartDay as WeekdayIndex);
          setRecentYears(demoProfile.recentYears);
          setShowLegend(demoProfile.showLegend ?? true);
          setDayOffAllowance(demoProfile.dayOffAllowance ?? 15);
          setDayOffs({});
          setWeeklyGoalsTemplate(
            normalizeWeeklyGoalsTemplate(demoProfile.weeklyGoalsTemplate ?? weeklyGoalsTemplate)
          );
          setView("productivity");
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
        if (storedView === "life" || storedView === "productivity") {
          if (isLoggedIn) {
            setView(storedView);
          } else {
            setView("productivity");
          }
        } else if (!isLoggedIn) {
          setView("productivity");
        }

        if (!isLoggedIn || !hasProfileLegend) {
          const storedShowLegend = window.localStorage.getItem("timespent-show-legend");
          if (storedShowLegend === "true") {
            setShowLegend(true);
          } else if (storedShowLegend === "false") {
            setShowLegend(false);
          } else {
            const storedLegendHidden = window.localStorage.getItem("timespent-hide-legend");
            if (storedLegendHidden === "true") {
              setShowLegend(false);
            }
          }
        }

        if (!isLoggedIn || !hasProfileWeeklyTemplate) {
          const storedWeeklyTemplate = window.localStorage.getItem("timespent-weekly-goals-template");
          if (storedWeeklyTemplate) {
            setWeeklyGoalsTemplate(normalizeWeeklyGoalsTemplate(storedWeeklyTemplate));
          }
        }

        if (!isLoggedIn) {
          const storedDayOffs = window.localStorage.getItem("timespent-day-offs");
          if (storedDayOffs) {
            try {
              const parsedDayOffs = JSON.parse(storedDayOffs) as Record<string, boolean>;
              if (parsedDayOffs && typeof parsedDayOffs === "object") {
                setDayOffs(parsedDayOffs);
              }
            } catch (error) {
              console.error("Failed to parse cached day offs", error);
            }
          }
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
          goalsSectionTitle,
        })
      );
    } catch (error) {
      console.error("Failed to save profile", error);
    }

    if (!userEmail || !hasLoadedServerDataRef.current || isDemoMode) {
      return;
    }

    const profilePayload = {
      personName: personName || null,
      dateOfBirth: dateOfBirth || null,
      weekStartDay,
      recentYears,
      goalsSectionTitle,
      productivityScaleMode,
      showLegend,
      weeklyGoalsTemplate,
      dayOffAllowance
    };
    const serializedProfile = JSON.stringify(profilePayload);
    if (lastServerSavedProfileRef.current === serializedProfile) {
      return;
    }

    void (async () => {
      try {
        await saveProfile(profilePayload);
        lastServerSavedProfileRef.current = serializedProfile;
      } catch (error) {
        console.error("Failed to save profile", error);
      }
    })();
  }, [personName, dateOfBirth, email, weekStartDay, recentYears, goalsSectionTitle, productivityScaleMode, showLegend, weeklyGoalsTemplate, dayOffAllowance, isHydrated, userEmail, isDemoMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem("timespent-active-view", view);
    } catch (error) {
      console.error("Failed to cache active view", error);
    }
  }, [view]);

  useEffect(() => {
    if (!isHydrated) return;

    const serialized = JSON.stringify(productivityRatings);
    if (lastProcessedProductivityRef.current === serialized) {
      return;
    }
    lastProcessedProductivityRef.current = serialized;

    if (!userEmail) {
      try {
        window.localStorage.setItem("timespent-productivity-ratings", serialized);
      } catch (error) {
        console.error("Failed to cache productivity ratings", error);
      }
      return;
    }

    if (!hasLoadedServerDataRef.current || isDemoMode) {
      return;
    }

    pendingProductivityRef.current = productivityRatings;

    if (productivitySaveTimeoutRef.current) {
      window.clearTimeout(productivitySaveTimeoutRef.current);
    }

    productivitySaveTimeoutRef.current = window.setTimeout(() => {
      productivitySaveTimeoutRef.current = null;
      triggerProductivitySave();
    }, 600);

    return () => {
      if (productivitySaveTimeoutRef.current) {
        window.clearTimeout(productivitySaveTimeoutRef.current);
        productivitySaveTimeoutRef.current = null;
      }
    };
  }, [productivityRatings, isHydrated, userEmail, isDemoMode, triggerProductivitySave]);

  useEffect(() => {
    if (!isHydrated) return;

    const serialized = JSON.stringify(dayOffs);
    if (lastProcessedDayOffsRef.current === serialized) {
      return;
    }
    lastProcessedDayOffsRef.current = serialized;

    if (!userEmail) {
      try {
        window.localStorage.setItem("timespent-day-offs", serialized);
      } catch (error) {
        console.error("Failed to cache day offs", error);
      }
      return;
    }

    if (!hasLoadedServerDataRef.current || isDemoMode) {
      return;
    }

    pendingDayOffsRef.current = dayOffs;

    if (dayOffsSaveTimeoutRef.current) {
      window.clearTimeout(dayOffsSaveTimeoutRef.current);
    }

    dayOffsSaveTimeoutRef.current = window.setTimeout(() => {
      dayOffsSaveTimeoutRef.current = null;
      triggerDayOffsSave();
    }, 600);

    return () => {
      if (dayOffsSaveTimeoutRef.current) {
        window.clearTimeout(dayOffsSaveTimeoutRef.current);
        dayOffsSaveTimeoutRef.current = null;
      }
    };
  }, [dayOffs, isHydrated, userEmail, isDemoMode, triggerDayOffsSave]);

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
      window.localStorage.setItem("timespent-show-legend", showLegend ? "true" : "false");
    } catch (error) {
      console.error("Failed to cache legend preference", error);
    }
  }, [showLegend, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem("timespent-weekly-goals-template", weeklyGoalsTemplate);
    } catch (error) {
      console.error("Failed to cache weekly goals template", error);
    }
  }, [weeklyGoalsTemplate, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    const serializedSchedule = JSON.stringify(scheduleEntries);
    if (lastProcessedScheduleRef.current === serializedSchedule) {
      return;
    }
    lastProcessedScheduleRef.current = serializedSchedule;

    try {
      // Filter to keep only recent entries (last 90 days) to prevent quota issues
      const recentEntries = filterRecentScheduleEntries(scheduleEntries);

      // Save to localStorage as backup with quota error handling
      const saved = safeLocalStorageSetItem(
        "timespent-schedule-entries",
        JSON.stringify(recentEntries),
        () => {
          // If quota is still exceeded after filtering, try to clear and retry
          console.warn("Attempting to clear old data and retry...");
          cleanupOldScheduleEntries();
        }
      );

      if (!saved) {
        console.warn("Could not save schedule entries to localStorage due to quota limits");
      }

      if (!userEmail || isDemoMode) {
        return;
      }

      if (!hasLoadedServerDataRef.current) {
        return;
      }

      pendingScheduleRef.current = scheduleEntries;

      if (scheduleSaveTimeoutRef.current) {
        window.clearTimeout(scheduleSaveTimeoutRef.current);
      }
      scheduleSaveTimeoutRef.current = window.setTimeout(() => {
        scheduleSaveTimeoutRef.current = null;
        triggerScheduleSave();
      }, 600);
    } catch (error) {
      console.error("Failed to save schedule entries", error);
    }

    return () => {
      if (scheduleSaveTimeoutRef.current) {
        window.clearTimeout(scheduleSaveTimeoutRef.current);
        scheduleSaveTimeoutRef.current = null;
      }
    };
  }, [scheduleEntries, isHydrated, userEmail, triggerScheduleSave]);

  useEffect(() => {
    if (!isHydrated) return;

    const serializedGoals = JSON.stringify(goals);
    if (lastProcessedGoalsRef.current === serializedGoals) {
      return;
    }
    lastProcessedGoalsRef.current = serializedGoals;

    if (!userEmail) {
      try {
        window.localStorage.setItem("timespent-goals", serializedGoals);
      } catch (error) {
        console.error("Failed to cache goals for guest", error);
      }
      return;
    }

    if (!hasLoadedServerDataRef.current || isDemoMode) {
      return;
    }

    pendingGoalsRef.current = goals;

    if (goalsSaveTimeoutRef.current) {
      window.clearTimeout(goalsSaveTimeoutRef.current);
    }

    goalsSaveTimeoutRef.current = window.setTimeout(() => {
      goalsSaveTimeoutRef.current = null;
      triggerGoalsSave();
    }, 600);

    return () => {
      if (goalsSaveTimeoutRef.current) {
        window.clearTimeout(goalsSaveTimeoutRef.current);
        goalsSaveTimeoutRef.current = null;
      }
    };
  }, [goals, isHydrated, userEmail, isDemoMode, triggerGoalsSave]);

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

    const serialized = JSON.stringify(weeklyNotes);
    if (lastProcessedWeeklyNotesRef.current === serialized) {
      return;
    }
    lastProcessedWeeklyNotesRef.current = serialized;

    if (!userEmail) {
      try {
        window.localStorage.setItem("timespent-weekly-notes", serialized);
      } catch (error) {
        console.error("Failed to cache weekly notes", error);
      }
      return;
    }

    if (!hasLoadedServerDataRef.current || isDemoMode) {
      return;
    }

    pendingWeeklyNotesRef.current = weeklyNotes;

    if (weeklyNotesSaveTimeoutRef.current) {
      window.clearTimeout(weeklyNotesSaveTimeoutRef.current);
    }

    weeklyNotesSaveTimeoutRef.current = window.setTimeout(() => {
      weeklyNotesSaveTimeoutRef.current = null;
      triggerWeeklyNotesSave();
    }, 600);

    return () => {
      if (weeklyNotesSaveTimeoutRef.current) {
        window.clearTimeout(weeklyNotesSaveTimeoutRef.current);
        weeklyNotesSaveTimeoutRef.current = null;
      }
    };
  }, [weeklyNotes, isHydrated, userEmail, isDemoMode, triggerWeeklyNotesSave]);

  const selectedWeek = useMemo(
    () => (selectedWeekKey ? weeksForYear.find((week) => week.weekKey === selectedWeekKey) : null),
    [selectedWeekKey, weeksForYear]
  );

  useEffect(() => {
    setSelectedWeekKey(null);
  }, [weekStartDay]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (lastWeekStartDayRef.current === null) {
      lastWeekStartDayRef.current = weekStartDay;
      return;
    }
    if (lastWeekStartDayRef.current === weekStartDay) {
      return;
    }

    setProductivityRatings((prev) => remapWeekKeys(prev, weekStartDay));
    setWeeklyNotes((prev) => remapWeekKeys(prev, weekStartDay));
    lastWeekStartDayRef.current = weekStartDay;
  }, [weekStartDay, isHydrated]);

  // Set current week as selected by default when viewing productivity tracker
  useEffect(() => {
    if (view === "productivity" && selectedWeekKey === null) {
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
    }
  }, [view, weeksForYear, selectedWeekKey]);

  const isProfileComplete = Boolean(personName && dateOfBirth && email);
  const isProfileEditorVisible = isEditingProfile;

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const navbarWeekLabel = useMemo(() => {
    const findWeekForDate = (date: Date) =>
      weeksForYear.find((week) =>
        week.dayKeys.some((dayKey) => {
          const [y, m, d] = dayKey.split("-").map(Number);
          const keyDate = new Date(y!, m! - 1, d);
          return (
            keyDate.getFullYear() === date.getFullYear() &&
            keyDate.getMonth() === date.getMonth() &&
            keyDate.getDate() === date.getDate()
          );
        })
      );

    const activeWeek = selectedWeek ?? findWeekForDate(new Date());

    if (!activeWeek) {
      return "Select a week";
    }

    const [firstDayKey] = activeWeek.dayKeys;
    let labelYear = productivityYear;
    if (firstDayKey) {
      const [yearPart] = firstDayKey.split("-");
      const parsedYear = Number(yearPart);
      if (Number.isFinite(parsedYear)) {
        labelYear = parsedYear;
      }
    }

    return `${activeWeek.rangeLabel}, ${labelYear}`;
  }, [weeksForYear, selectedWeek, productivityYear]);

  const shiftSelectedWeek = (direction: -1 | 1) => {
    if (!weeksForYear.length) return;
    let currentIndex = selectedWeekKey
      ? weeksForYear.findIndex((week) => week.weekKey === selectedWeekKey)
      : -1;
    if (currentIndex === -1) {
      const today = new Date();
      currentIndex = weeksForYear.findIndex((week) =>
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
    }
    if (currentIndex === -1) {
      currentIndex = 0;
    }
    let targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= weeksForYear.length) {
      const nextYear = productivityYear + (direction === 1 ? 1 : -1);
      const nextWeeks = buildWeeksForYear(nextYear, weekStartDay);
      if (!nextWeeks.length) {
        return;
      }
      setProductivityYear(nextYear);
      setSelectedWeekKey(
        direction === 1 ? nextWeeks[0]!.weekKey : nextWeeks[nextWeeks.length - 1]!.weekKey
      );
      return;
    }
    setSelectedWeekKey(weeksForYear[targetIndex]!.weekKey);
  };

  const handleCreateShare = async () => {
    const trimmedEmail = shareEmail.trim();
    if (!trimmedEmail) {
      setShareError("Enter an email to share.");
      return;
    }
    setShareError(null);
    const optimisticId = `temp-${Date.now()}`;
    const optimisticShare: ShareListItem = {
      id: optimisticId,
      recipientEmail: trimmedEmail,
    };
    setSharedByMe((prev) => [optimisticShare, ...prev]);
    setShareEmail("");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: trimmedEmail }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setShareError(data.error || "Unable to share right now.");
        setSharedByMe((prev) => prev.filter((share) => share.id !== optimisticId));
        return;
      }
      await fetchShares();
    } catch (error) {
      setShareError("Unable to share right now.");
      setSharedByMe((prev) => prev.filter((share) => share.id !== optimisticId));
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    const previousShares = sharedByMe;
    setSharedByMe((prev) => prev.filter((share) => share.id !== shareId));
    try {
      const response = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
      if (!response.ok) {
        setShareError("Unable to revoke share.");
        setSharedByMe(previousShares);
        return;
      }
      await fetchShares();
    } catch (error) {
      setShareError("Unable to revoke share.");
      setSharedByMe(previousShares);
    }
  };

  const generateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAddGoal = () => {
    const title = newGoalTitle.trim();
    if (!title) {
      return;
    }

    // Check if a goal with the exact same title already exists
    const duplicateExists = goals.some(goal => goal.title.toLowerCase() === title.toLowerCase());
    if (duplicateExists) {
      alert("A goal with this name already exists. Please use a different name.");
      return;
    }

    const nextGoal: Goal = {
      id: generateId(),
      title,
      timeframe: "",
      keyResults: [],
      archived: false,
    };
    setGoals((prev) => {
      const updatedGoals = [...prev, nextGoal];
      saveGoalsNow(updatedGoals);
      return updatedGoals;
    });
    setNewGoalTitle("");
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

  const handleArchiveGoal = async (goalId: string) => {
    const goalToArchive = goals.find((g) => g.id === goalId);
    if (!goalToArchive) {
      return;
    }

    const previousGoals = goals;
    const previousArchivedGoals = archivedGoals;
    const updatedGoal = { ...goalToArchive, archived: true };

    // Optimistic update
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
    setArchivedGoals((prev) => [...prev, updatedGoal]);

    try {
      const response = await fetch('/api/goals/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, archived: true })
      });

      if (!response.ok) {
        throw new Error('Failed to archive goal');
      }
    } catch (error) {
      console.error('Error archiving goal:', error);
      setGoals(previousGoals);
      setArchivedGoals(previousArchivedGoals);
      alert('Failed to archive goal. Please try again.');
    }
  };

  const handleUnarchiveGoal = async (goalId: string) => {
    const goalToUnarchive = archivedGoals.find((g) => g.id === goalId);
    if (!goalToUnarchive) {
      return;
    }

    const previousGoals = goals;
    const previousArchivedGoals = archivedGoals;
    const updatedGoal = { ...goalToUnarchive, archived: false };

    // Optimistic update
    setArchivedGoals((prev) => prev.filter((goal) => goal.id !== goalId));
    setGoals((prev) => [...prev, updatedGoal]);

    try {
      const response = await fetch('/api/goals/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, archived: false })
      });

      if (!response.ok) {
        throw new Error('Failed to unarchive goal');
      }
    } catch (error) {
      console.error('Error unarchiving goal:', error);
      setGoals(previousGoals);
      setArchivedGoals(previousArchivedGoals);
      alert('Failed to unarchive goal. Please try again.');
    }
  };

  const fetchArchivedGoals = async () => {
    if (!userEmail || isDemoMode) return;

    try {
      const response = await fetch('/api/goals/archive');
      if (!response.ok) {
        throw new Error('Failed to fetch archived goals');
      }
      const data = await response.json();
      setArchivedGoals(data.goals || []);
    } catch (error) {
      console.error('Error fetching archived goals:', error);
    }
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

  const updateWeeklyNoteEntry = (weekKey: string, updates: Partial<WeeklyNoteEntry>) => {
    setWeeklyNotes((prev) => {
      const existing = prev[weekKey] ?? createWeeklyNoteEntry();
      return {
        ...prev,
        [weekKey]: {
          content: updates.content ?? existing.content,
          dos: updates.dos ?? existing.dos,
          donts: updates.donts ?? existing.donts,
        },
      };
    });
  };

  const startGoalDraft = () => {
    setIsAddingGoal(true);
  };

  const cancelGoalDraft = () => {
    setIsAddingGoal(false);
    setNewGoalTitle("");
  };

  const beginGoalFieldEdit = (goal: Goal, field: "title") => {
    const currentValue = goal.title;
    setActiveGoalFieldEdit({ goalId: goal.id, field });
    setGoalFieldDrafts((prev) => ({
      ...prev,
      [goal.id]: {
        ...prev[goal.id],
        [field]: prev[goal.id]?.[field] ?? currentValue,
      },
    }));
  };

  const handleGoalFieldDraftChange = (goalId: string, field: "title", value: string) => {
    setGoalFieldDrafts((prev) => ({
      ...prev,
      [goalId]: {
        ...prev[goalId],
        [field]: value,
      },
    }));
  };

  const clearGoalFieldDraft = (goalId: string, field: "title") => {
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

  const commitGoalFieldEdit = (goalId: string, field: "title") => {
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
              title: trimmed,
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

  const cancelGoalFieldEdit = (goalId: string, field: "title") => {
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
    field: "title"
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
    setGoals((prev) => {
      const updatedGoals = prev.map((goal) =>
        goal.id === goalId
          ? { ...goal, keyResults: [...goal.keyResults, newKr] }
          : goal
      );
      saveGoalsNow(updatedGoals);
      return updatedGoals;
    });
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
    const order: KeyResultStatus[] = ["on-hold", "started", "completed"];
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
    case "on-hold":
      return "bg-[#fef9c3] text-[#92400e]";
    case "completed":
      return "bg-[#dcfce7] text-[#15803d]";
    default:
      return "bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] text-foreground";
  }
};

  const cycleGoalStatusOverride = (goalId: string) => {
    const order: KeyResultStatus[] = ["on-hold", "started", "completed"];
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

  useEffect(() => {
    if (!activeGoalCardId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const current = okrCardRefs.current[activeGoalCardId];
      if (!current) {
        setActiveGoalCardId(null);
        return;
      }
      if (event.target instanceof Node && current.contains(event.target)) {
        return;
      }
      setActiveGoalCardId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeGoalCardId]);

  const currentProductivityGoal = useMemo(() => {
    return productivityGoals[productivityYear] ?? "";
  }, [productivityGoals, productivityYear]);

  // Get previous week's key for carryover logic
  const getPreviousWeekKey = (weekKey: string | null): string | null => {
    if (!weekKey) {
      return null;
    }
    const parsed = parseWeekKey(weekKey);
    if (!parsed) {
      return null;
    }
    parsed.weekStart.setDate(parsed.weekStart.getDate() - 7);
    return formatWeekKey(parsed.weekStart, parsed.weekStartDay);
  };

  const getWeekEntryWithCarryover = (weekKey: string | null): WeeklyNoteEntry | null => {
    if (!weekKey) return null;

    const currentEntry = weeklyNotes[weekKey];

    // If current week has any saved data, return it as-is
    if (currentEntry) {
      return createWeeklyNoteEntry(currentEntry);
    }

    // Current week is empty, try to carry over from previous week
    if (selectedWeekKey) {
      const prevWeekKey = getPreviousWeekKey(selectedWeekKey);
      if (prevWeekKey) {
        const prevEntry = weeklyNotes[prevWeekKey];
        if (prevEntry && (prevEntry.dos || prevEntry.donts)) {
          // Carry over dos and donts, but not content
          return createWeeklyNoteEntry({
            content: "",
            dos: prevEntry.dos ?? "",
            donts: prevEntry.donts ?? ""
          });
        }
      }
    }

    return createWeeklyNoteEntry();
  };

  const selectedWeekEntry = getWeekEntryWithCarryover(selectedWeekKey);
  const selectedWeekContentText =
    selectedWeekEntry?.content?.replace(/<[^>]*>/g, "").trim() ?? "";
  const templateContentText = weeklyGoalsTemplate.replace(/<[^>]*>/g, "").trim();
  const isWeeklyGoalsEmpty = selectedWeekKey ? selectedWeekContentText.length === 0 : true;

  const resizeTextareaToFit = (target: HTMLTextAreaElement | null) => {
    if (!target) return;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  };

  useEffect(() => {
    resizeTextareaToFit(dosTextareaRef.current);
    resizeTextareaToFit(dontsTextareaRef.current);
  }, [selectedWeekEntry?.dos, selectedWeekEntry?.donts]);
  const dosDontsPanel = selectedWeekKey ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <label
        className="flex flex-col gap-2 rounded-2xl p-3"
        style={{ backgroundColor: "#e8f5e9" }}
      >
        <span className="text-xs uppercase tracking-[0.3em] text-[#0f172a] dark:text-[#0f172a]">
          Do&apos;s
        </span>
        <textarea
          ref={dosTextareaRef}
          value={selectedWeekEntry?.dos ?? ""}
          onChange={(event) => {
            updateWeeklyNoteEntry(selectedWeekKey, { dos: event.target.value });
            resizeTextareaToFit(event.target);
          }}
          onInput={(event) => {
            const target = event.target as HTMLTextAreaElement;
            resizeTextareaToFit(target);
          }}
          placeholder="Behaviors to reinforce"
          className="min-h-22 resize-none overflow-hidden rounded-2xl border-none bg-transparent p-2 text-[13px] text-[#0f172a] outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--foreground)_30%,transparent)] sm:text-sm"
          style={{ height: "auto" }}
        />
      </label>
      <label
        className="flex flex-col gap-2 rounded-2xl p-3"
        style={{ backgroundColor: "#ffebee" }}
      >
        <span className="text-xs uppercase tracking-[0.3em] text-[#0f172a] dark:text-[#0f172a]">
          Don&apos;ts
        </span>
        <textarea
          ref={dontsTextareaRef}
          value={selectedWeekEntry?.donts ?? ""}
          onChange={(event) => {
            updateWeeklyNoteEntry(selectedWeekKey, { donts: event.target.value });
            resizeTextareaToFit(event.target);
          }}
          onInput={(event) => {
            const target = event.target as HTMLTextAreaElement;
            resizeTextareaToFit(target);
          }}
          placeholder="Behaviors to avoid"
          className="min-h-22 resize-none overflow-hidden rounded-2xl border-none bg-transparent p-2 text-[13px] text-[#0f172a] outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--foreground)_30%,transparent)] sm:text-sm"
          style={{ height: "auto" }}
        />
      </label>
    </div>
  ) : null;

  const parsedRecentYears = useMemo(() => {
    const parsed = Number.parseInt(recentYears, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(parsed, 90);
  }, [recentYears]);

  const scrollToGoalsSection = () => {
    setView("productivity");
    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      goalsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const renderGoalsSection = (
    spacingClass = "mt-8",
    sectionRef?: RefObject<HTMLDivElement | null>
  ) => (
    <section
      ref={sectionRef}
      className={`mx-auto ${spacingClass} flex max-w-4xl flex-col gap-4 pt-16 text-left`}
    >
      <div className="space-y-6 pt-6">
        <div className="text-center">
          {isEditingGoalsSectionTitle ? (
            <input
              type="text"
              value={goalsSectionTitle}
              onChange={(e) => setGoalsSectionTitle(e.target.value)}
              onBlur={() => setIsEditingGoalsSectionTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingGoalsSectionTitle(false);
                }
              }}
              autoFocus
              className="w-full border-b border-foreground bg-transparent text-center text-2xl font-light uppercase tracking-[0.25em] text-foreground outline-none sm:text-3xl sm:tracking-[0.4em]"
            />
          ) : (
            <h2
              onClick={() => setIsEditingGoalsSectionTitle(true)}
              className="text-2xl font-light uppercase tracking-[0.25em] text-foreground cursor-pointer transition hover:opacity-70 sm:text-3xl sm:tracking-[0.4em]"
            >
              {goalsSectionTitle}
            </h2>
          )}
        </div>
        {!isViewingArchived && goals.length === 0 && (
          <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] text-center">
            No goals yet. Define your first objective above to start tracking OKRs.
          </p>
        )}
        {isViewingArchived && archivedGoals.length === 0 && (
          <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] text-center">
            No archived goals yet.
          </p>
        )}
        {(isViewingArchived ? archivedGoals : goals).map((goal) => {
          const draft = krDrafts[goal.id] ?? { title: "" };
          return (
            <div
              key={goal.id}
              className="okr-card px-7 py-6"
              onClick={() => setActiveGoalCardId(goal.id)}
              onFocusCapture={() => setActiveGoalCardId(goal.id)}
              ref={(node) => {
                if (node) {
                  okrCardRefs.current[goal.id] = node;
                } else {
                  delete okrCardRefs.current[goal.id];
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-1 flex-col">
                  {activeGoalFieldEdit?.goalId === goal.id &&
                  activeGoalFieldEdit.field === "title" &&
                  !isViewingArchived ? (
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
                  ) : isViewingArchived ? (
                    <h3 className="text-left text-base sm:text-2xl font-light text-foreground">
                      {goal.title}
                    </h3>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beginGoalFieldEdit(goal, "title")}
                      className="text-left text-base sm:text-2xl font-light text-foreground transition hover:text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                    >
                      {goal.title}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {activeGoalCardId === goal.id && (
                    <>
                      {isViewingArchived ? (
                        <button
                          type="button"
                          onClick={() => handleUnarchiveGoal(goal.id)}
                          className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] transition hover:text-foreground"
                          aria-label="Unarchive goal"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchiveGoal(goal.id)}
                          className="text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] transition hover:text-foreground"
                          aria-label="Archive goal"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveGoal(goal.id)}
                        className="text-xs text-[color-mix(in_srgb,var(--foreground)_50%,transparent)] transition hover:text-foreground"
                        aria-label="Remove goal"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-0">
                {goal.keyResults.map((kr, krIndex) => {
                  const krKey = krFieldKey(goal.id, kr.id);
                  const isEditingKrTitle =
                    activeKrFieldEdit?.goalId === goal.id &&
                    activeKrFieldEdit.krId === kr.id &&
                    activeKrFieldEdit.field === "title" &&
                    !isViewingArchived;
                  return (
                    <div key={kr.id} className="rounded-2xl px-3 py-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
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
                              className="kr-apple-font w-full border-b border-transparent bg-transparent text-sm font-medium text-foreground outline-none focus:border-foreground"
                            />
                          ) : isViewingArchived ? (
                            <span className="kr-apple-font text-left text-sm font-medium text-foreground">
                              {kr.title || "Untitled key result"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                beginKrFieldEdit(goal.id, kr, "title")
                              }
                              className="kr-apple-font text-left text-sm font-medium text-foreground transition hover:text-[color-mix(in_srgb,var(--foreground)_80%,transparent)]"
                            >
                              {kr.title || "Untitled key result"}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!isViewingArchived && (
                            <button
                              type="button"
                              onClick={() =>
                                cycleKeyResultStatus(goal.id, kr.id)
                              }
                              className={`rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-base sm:text-lg ${goalStatusBadge(
                                kr.status
                              )}`}
                              title={kr.status === "started"
                                ? "Started"
                                : kr.status === "on-hold"
                                  ? "On hold"
                                  : "Completed"}
                            >
                              {kr.status === "started"
                              ? "▶️"
                              : kr.status === "on-hold"
                                ? "⏸️"
                                : "✅"}
                            </button>
                          )}
                          {isViewingArchived && (
                            <span
                              className={`rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-base sm:text-lg ${goalStatusBadge(
                                kr.status
                              )}`}
                              title={kr.status === "started"
                                ? "Started"
                                : kr.status === "on-hold"
                                  ? "On hold"
                                  : "Completed"}
                            >
                              {kr.status === "started"
                              ? "▶️"
                              : kr.status === "on-hold"
                                ? "⏸️"
                                : "✅"}
                            </span>
                          )}
                          {activeGoalCardId === goal.id && !isViewingArchived && (
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
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {activeKrDraftGoalId === goal.id && (
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
                {activeGoalCardId === goal.id && activeKrDraftGoalId !== goal.id && !isViewingArchived && (
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => startKeyResultDraft(goal.id)}
                      className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_75%,transparent)] transition hover:text-foreground"
                    >
                      + Add KR
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {!isAddingGoal ? (
          <>
            <button
              type="button"
              onClick={startGoalDraft}
              className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
            >
              + Add OKR
            </button>
            <button
              type="button"
              onClick={() => {
                setIsViewingArchived(!isViewingArchived);
                if (!isViewingArchived && archivedGoals.length === 0) {
                  fetchArchivedGoals();
                }
              }}
              className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
            >
              {isViewingArchived ? 'Back to Active' : 'Archived'}
            </button>
          </>
        ) : (
          <div className="w-full max-w-3xl okr-card p-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <input
                type="text"
                value={newGoalTitle}
                onChange={(event) => setNewGoalTitle(event.target.value)}
                placeholder="Objective title"
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
  );

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-foreground border-r-transparent"></div>
          <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground transition-colors">
      {!userEmail && isHydrated ? (
        <div className="flex justify-end pl-6 pr-4 pt-4">
          <UserInfo />
        </div>
      ) : null}
      <main className="flex flex-1 items-start justify-center pl-6 pr-4">
        <div className="w-full py-2 text-center">
          {view === "productivity" && (
            <div className="mt-6 flex flex-col items-center gap-2 text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => shiftSelectedWeek(-1)}
                  className="rounded-full px-2 py-1 text-xs transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
                  aria-label="Previous week"
                >
                  ←
                </button>
                <span className="text-[10px] uppercase tracking-[0.4em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                  Week of
                </span>
                <button
                  type="button"
                  onClick={() => shiftSelectedWeek(1)}
                  className="rounded-full px-2 py-1 text-xs transition hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"
                  aria-label="Next week"
                >
                  →
                </button>
              </div>
              <h1 className="text-base sm:text-lg font-semibold uppercase tracking-[0.3em] text-foreground">
                {navbarWeekLabel}
              </h1>
            </div>
          )}
          {view === "life" && (
            <section className="mt-8 space-y-6">
              <WeeklySchedule
                scheduleEntries={scheduleEntries}
                setScheduleEntries={setScheduleEntries}
                weekStartDay={weekStartDay}
              />
            </section>
          )}

          {view === "productivity" && (
            <>
              <section className="mx-auto mt-8 grid max-w-480 gap-8 text-left lg:grid-cols-[1fr_1.2fr]">
                <div className="space-y-4 order-2 lg:order-1">
                  <ProductivityGrid
                    year={productivityYear}
                    setYear={setProductivityYear}
                    ratings={productivityRatings}
                    setRatings={setProductivityRatings}
                    dayOffs={dayOffs}
                    setDayOffs={setDayOffs}
                    scale={productivityScale}
                    mode={productivityMode}
                    showLegend={showLegend}
                    onToggleMode={() => {
                      const newMode = productivityMode === "day" ? "week" : "day";
                      setProductivityMode(newMode);
                      // Save preference to profile
                      if (!isDemoMode) {
                        saveProfile({
                          personName,
                          dateOfBirth,
                          weekStartDay,
                          recentYears,
                          goalsSectionTitle,
                          productivityScaleMode,
                          showLegend,
                          weeklyGoalsTemplate,
                          dayOffAllowance,
                          productivityViewMode: newMode,
                        });
                      }
                    }}
                    dayOffMode={isDayOffMode}
                    setDayOffMode={setIsDayOffMode}
                    dayOffsRemaining={dayOffsRemaining}
                    dayOffAllowance={dayOffAllowance}
                    selectedWeekKey={selectedWeekKey}
                    setSelectedWeekKey={setSelectedWeekKey}
                    weekStartDay={weekStartDay}
                  />
                  {productivityMode === "week" && dosDontsPanel ? (
                    <div className="mt-4 hidden lg:block">{dosDontsPanel}</div>
                  ) : null}
                </div>

                <div className="flex flex-col rounded-3xl px-4 pb-4 pt-0 order-1 lg:order-2">
                {productivityMode === "day" && dosDontsPanel ? (
                  <div className="mb-4">{dosDontsPanel}</div>
                ) : null}
                {productivityMode === "week" && dosDontsPanel ? (
                  <div className="mb-4 lg:hidden">{dosDontsPanel}</div>
                ) : null}
                <div
                  className="flex-1 rounded-2xl px-4 pt-4 pb-4"
                  style={{ backgroundColor: "var(--card-muted-bg)" }}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="block text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Weekly goals
                    </span>
                    {selectedWeekKey && isWeeklyGoalsEmpty && templateContentText ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateWeeklyNoteEntry(selectedWeekKey, {
                            content: weeklyGoalsTemplate,
                          })
                        }
                        className="text-[10px] uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] transition hover:text-foreground"
                      >
                        Use template
                      </button>
                    ) : null}
                  </div>
                  <TinyEditor
                    key={selectedWeekKey ? `week-notes-${selectedWeekKey}` : `productivity-goal-${productivityYear}`}
                    tinymceScriptSrc={TINYMCE_CDN}
                    value={selectedWeekKey ? selectedWeekEntry?.content ?? "" : currentProductivityGoal}
                    init={
                      {
                        menubar: false,
                        statusbar: false,
                        height: 430,
                        license_key: "gpl",
                        plugins: "lists quickbars link",
                        skin: theme === "dark" ? "oxide-dark" : "oxide",
                        content_css: false,
                        toolbar: false,
                        quickbars_selection_toolbar: "bold italic bullist numlist link",
                        quickbars_insert_toolbar: false,
                        content_style: `
                          body {
                            background-color: #f1e9e5 !important;
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
                        placeholder: selectedWeekKey
                          ? "What are your goals this week, and did you accomplish them?"
                          : "",
                      } as Record<string, unknown>
                    }
                    onEditorChange={(content) =>
                      selectedWeekKey
                        ? updateWeeklyNoteEntry(selectedWeekKey, { content })
                        : setProductivityGoals((prev) => ({
                            ...prev,
                            [productivityYear]: content,
                          }))
                    }
                  />
                </div>
                </div>
              </section>
              {renderGoalsSection("mt-12", goalsSectionRef)}
            </>
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 overflow-y-auto"
          onClick={() => setIsEditingProfile(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-6 text-left shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
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
            <div className="grid gap-4 lg:grid-cols-2">
              {userEmail && (
                <div className="rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] p-4">
                  <UserInfo showLabel />
                </div>
              )}
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                <input
                  type="text"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder="Your name"
                  className="mt-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-1.5 text-sm text-foreground outline-none focus:border-foreground"
                />
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                <div className="mt-1 flex items-center justify-between rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-4 py-2">
                  <span className="text-sm normal-case tracking-normal text-foreground">
                    Enable 4-tier scale ({">"}75%)
                  </span>
                  <input
                    type="checkbox"
                    checked={productivityScaleMode === "4"}
                    onChange={(event) =>
                      setProductivityScaleMode(event.target.checked ? "4" : "3")
                    }
                    className="h-4 w-4 accent-foreground"
                  />
                </div>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                <div className="mt-1 flex items-center justify-between rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-4 py-2">
                  <span className="text-sm normal-case tracking-normal text-foreground">
                    Show goals achieved legend
                  </span>
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(event) => setShowLegend(event.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                </div>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                <div className="mt-1 flex items-center justify-between rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-4 py-2">
                  <span className="text-sm normal-case tracking-normal text-foreground">
                    Day off days per year
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={dayOffAllowance}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (Number.isFinite(nextValue)) {
                        setDayOffAllowance(Math.max(0, Math.min(365, nextValue)));
                      }
                    }}
                    className="w-20 rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-3 py-1 text-sm text-foreground outline-none focus:border-foreground"
                  />
                </div>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] lg:col-span-2">
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                    Week starts
                  </span>
                  {[0, 1].map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setWeekStartDay(day as WeekdayIndex)}
                      className={`rounded-full border px-3 py-1 text-[10px] transition sm:px-4 sm:py-1.5 sm:text-xs ${
                        weekStartDay === day
                          ? "border-foreground text-foreground"
                          : "border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] hover:border-foreground"
                      }`}
                    >
                      {day === 0 ? "Sunday" : "Monday"}
                    </button>
                  ))}
                </div>
              </label>
              <label className="flex flex-col text-xs uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] lg:col-span-2">
                Weekly goals template
                <div className="mt-2 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent p-2">
                  <TinyEditor
                    tinymceScriptSrc={TINYMCE_CDN}
                    value={weeklyGoalsTemplate}
                    init={
                      {
                        menubar: false,
                        statusbar: false,
                        height: 300,
                        license_key: "gpl",
                        plugins: "lists quickbars link",
                        skin: theme === "dark" ? "oxide-dark" : "oxide",
                        content_css: false,
                        toolbar: false,
                        quickbars_selection_toolbar: "bold italic bullist numlist link",
                        quickbars_insert_toolbar: false,
                        content_style: `
                          body {
                            background-color: transparent !important;
                            color: #0f172a !important;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                            font-size: 15px;
                            padding: 8px;
                            margin: 0;
                          }
                          * {
                            background-color: transparent !important;
                          }
                        `,
                        branding: false,
                      } as Record<string, unknown>
                    }
                    onEditorChange={(content) =>
                      setWeeklyGoalsTemplate(normalizeWeeklyGoalsTemplate(content))
                    }
                  />
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {isShareEditorVisible && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 overflow-y-auto"
          onClick={() => setIsShareEditorVisible(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-6 text-left shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                  Sharing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsShareEditorVisible(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]"
              >
                ✕
              </button>
            </div>
            {!userEmail ? (
              <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
                Sign in to share your goals and view shared pages.
              </p>
            ) : (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="Email address"
                    className="flex-1 min-w-[220px] rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] bg-transparent px-4 py-2 text-sm normal-case tracking-normal text-foreground outline-none focus:border-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleCreateShare}
                    className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_25%,transparent)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-foreground transition hover:border-foreground"
                  >
                    Share
                  </button>
                </div>
                {shareError && (
                  <p className="text-xs normal-case tracking-normal text-[#f87171]">
                    {shareError}
                  </p>
                )}
                {isLoadingShares && (
                  <p className="text-xs normal-case tracking-normal text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                    Loading shares...
                  </p>
                )}
                {sharedByMe.length > 0 && (
                  <div className="space-y-2 text-xs normal-case tracking-normal text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Goals you're sharing
                    </span>
                    {sharedByMe.map((share) => (
                      <div key={share.id} className="flex flex-wrap items-center gap-2">
                        <span>{share.recipientUser?.email || share.recipientEmail}</span>
                        <Link
                          href={`/shared/${share.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:text-foreground"
                        >
                          Preview
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleRevokeShare(share.id)}
                          className="text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:text-foreground"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {sharedWithMe.length > 0 && (
                  <div className="space-y-2 text-xs normal-case tracking-normal text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                      Goals shared with me
                    </span>
                    {sharedWithMe.map((share) => (
                      <div key={share.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {share.owner?.profile?.personName ||
                            share.owner?.email ||
                            "Shared account"}
                        </span>
                        <Link
                          href={`/shared/${share.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] transition hover:text-foreground"
                        >
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="mt-24 bg-slate-900 text-white px-6 md:px-24 py-8 text-sm">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="order-2 flex flex-1 justify-center text-center">
            <div>
              <p className="text-base font-medium text-white">© {new Date().getFullYear()} {APP_NAME}</p>
              <p className="text-xs text-white/70">
                Personal goal and productivity tracker
              </p>
            </div>
          </div>

          <div className="order-1 flex justify-center">
            <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsShareEditorVisible((prev) => !prev);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition ${
                isShareEditorVisible
                  ? "border-white"
                  : "hover:border-white"
              }`}
              aria-label="Open sharing"
              aria-pressed={isShareEditorVisible}
            >
              🔗
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditingProfile((prev) => !prev);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition ${
                isProfileEditorVisible
                  ? "border-white"
                  : "hover:border-white"
              }`}
              aria-label="Toggle profile settings"
              aria-pressed={isProfileEditorVisible}
            >
              ⚙️
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-lg text-white transition hover:border-white"
              aria-label="Toggle dark mode"
            >
              <span role="img" aria-hidden="true">
                {theme === "light" ? "🌙" : "☀️"}
              </span>
            </button>
            </div>
          </div>

          <div className="order-3 flex items-center justify-center gap-4 text-xs uppercase tracking-[0.3em] text-white/70">
            <Link href="/about" className="transition hover:text-white">
              About
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

type ProductivityLegendProps = {
  className?: string;
  scale: ProductivityScaleEntry[];
};

const ProductivityLegend = ({ className, scale }: ProductivityLegendProps) => (
  <div
    className={`flex flex-col gap-2 rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-4 text-[10px] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:text-xs ${className ?? ""}`}
  >
    <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.2em] sm:text-[10px]">
      Goals achieved (self-rated)
    </span>
    <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
      {scale.map((item) => (
        <div key={item.value} className="flex items-center gap-2 whitespace-nowrap">
          <span
            className={`h-3 w-3 rounded ${item.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] sm:h-4 sm:w-4`}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  </div>
);

type ProductivityGridProps = {
  year: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;
  ratings: Record<string, number | null>;
  setRatings: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  dayOffs: Record<string, boolean>;
  setDayOffs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  scale: ProductivityScaleEntry[];
  mode: "day" | "week";
  showLegend: boolean;
  onToggleMode: () => void;
  dayOffMode: boolean;
  setDayOffMode: React.Dispatch<React.SetStateAction<boolean>>;
  dayOffsRemaining: number;
  dayOffAllowance: number;
  selectedWeekKey: string | null;
  setSelectedWeekKey: React.Dispatch<React.SetStateAction<string | null>>;
  weekStartDay: WeekdayIndex;
};

const ProductivityGrid = ({
  year,
  setYear,
  ratings,
  setRatings,
  dayOffs,
  setDayOffs,
  scale,
  mode,
  showLegend,
  onToggleMode,
  dayOffMode,
  setDayOffMode,
  dayOffsRemaining,
  dayOffAllowance,
  selectedWeekKey,
  setSelectedWeekKey,
  weekStartDay,
}: ProductivityGridProps) => {
  const dayGridRef = useRef<HTMLDivElement | null>(null);
  const [hoveredDayDisplay, setHoveredDayDisplay] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const days = Array.from({ length: 31 }, (_, idx) => idx + 1);
  const months = Array.from({ length: 12 }, (_, idx) => idx);
  const weeks = useMemo(() => buildWeeksForYear(year, weekStartDay), [year, weekStartDay]);
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
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement | null>(null);
  const [isDayOffMenuOpen, setIsDayOffMenuOpen] = useState(false);
  const dayOffMenuRef = useRef<HTMLDivElement | null>(null);
  const toggleLabel = mode === "week" ? "Week" : "Day";
  const toggleButton = (
    <button
      type="button"
      onClick={onToggleMode}
      className="flex items-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
      aria-label={`Switch to ${mode === "week" ? "day" : "week"} view`}
    >
      {toggleLabel}
    </button>
  );
  const yearOptions = useMemo(() => [year - 1, year, year + 1], [year]);

  useEffect(() => {
    if (!isYearMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!yearMenuRef.current) return;
      if (event.target instanceof Node && !yearMenuRef.current.contains(event.target)) {
        setIsYearMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsYearMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isYearMenuOpen]);

  useEffect(() => {
    if (!isDayOffMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!dayOffMenuRef.current) return;
      if (event.target instanceof Node && !dayOffMenuRef.current.contains(event.target)) {
        setIsDayOffMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDayOffMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDayOffMenuOpen]);

  const yearControl = (
    <div ref={yearMenuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsYearMenuOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
        aria-label="Select year"
        aria-expanded={isYearMenuOpen}
      >
        {year}
        <svg
          aria-hidden="true"
          className={`h-3 w-3 transition ${isYearMenuOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M5 7l5 6 5-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isYearMenuOpen ? (
        <div className="absolute right-0 z-10 mt-2 w-36 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-1 shadow-lg">
          {yearOptions.map((optionYear) => (
            <button
              key={optionYear}
              type="button"
              onClick={() => {
                setYear(optionYear);
                setIsYearMenuOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                optionYear === year
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"
              }`}
            >
              <span>{optionYear}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
  const dayOffControl = (
    <div ref={dayOffMenuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsDayOffMenuOpen((prev) => !prev)}
        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
          dayOffMode
            ? "border-[#8dc8e6] text-[#3f6f88]"
            : "border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] hover:border-foreground"
        }`}
        aria-label="Day off options"
        aria-expanded={isDayOffMenuOpen}
      >
        Day Off
        <svg
          aria-hidden="true"
          className={`h-3 w-3 transition ${isDayOffMenuOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M5 7l5 6 5-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isDayOffMenuOpen ? (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-2xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
            <span>Days left</span>
            <span className="text-[11px] font-semibold text-foreground">
              {Math.max(0, dayOffsRemaining)} / {dayOffAllowance}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDayOffMode((prev) => !prev)}
            className={`mt-3 w-full rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
              dayOffMode
                ? "border-[#8dc8e6] bg-[#eef7fc] text-[#3f6f88]"
                : "border-[color-mix(in_srgb,var(--foreground)_20%,transparent)] text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] hover:border-foreground"
            }`}
          >
            {dayOffMode ? "Stop selecting" : "Add/remove day off"}
          </button>
        </div>
      ) : null}
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
      if (selectedWeekKey !== weekForDay.weekKey) {
        setSelectedWeekKey(weekForDay.weekKey);
        return;
      }
    }

    if (dayOffMode) {
      setDayOffs((prev) => {
        const next = { ...prev };
        const hasRating = ratings[key] !== null && ratings[key] !== undefined;
        if (next[key]) {
          delete next[key];
        } else if (!hasRating) {
          next[key] = true;
        }
        return next;
      });
      return;
    }

    if (dayOffs[key]) {
      return;
    }

    setRatings((prev) => {
      const current = prev[key];
      let next: number | null;
      if (current === undefined || current === null) {
        next = 0;
      } else if (current >= scale.length - 1) {
        next = null;
      } else {
        next = (current + 1) as number;
      }

      return { ...prev, [key]: next };
    });
  };

  const handleWeekCycle = (weekKey: string, hasDayScores: boolean) => {
    const key = weekKey;
    if (selectedWeekKey !== weekKey) {
      setSelectedWeekKey(weekKey);
      return;
    }

    if (dayOffMode) {
      const targetWeek = weeks.find((week) => week.weekKey === weekKey);
      if (!targetWeek) {
        return;
      }
      setDayOffs((prev) => {
        const next = { ...prev };
        const eligibleKeys = targetWeek.dayKeys.filter(
          (dayKey) => ratings[dayKey] === null || ratings[dayKey] === undefined
        );
        if (eligibleKeys.length === 0) {
          return next;
        }
        const hasAll = eligibleKeys.every((dayKey) => next[dayKey]);
        if (hasAll) {
          eligibleKeys.forEach((dayKey) => {
            delete next[dayKey];
          });
        } else {
          eligibleKeys.forEach((dayKey) => {
            next[dayKey] = true;
          });
        }
        return next;
      });
      return;
    }

    // Only cycle rating if there are no day scores
    if (!hasDayScores) {
      setRatings((prev) => {
        const current = prev[key];
        let next: number | null;
        if (current === undefined || current === null) {
          next = 0;
        } else if (current >= scale.length - 1) {
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

  const handleDayHover = (
    event: React.MouseEvent<HTMLButtonElement>,
    monthIndex: number,
    dayOfMonth: number
  ) => {
    if (mode !== "day") return;
    const containerRect = dayGridRef.current?.getBoundingClientRect();
    if (!containerRect) {
      setHoveredDayDisplay(null);
      return;
    }
    const date = new Date(year, monthIndex, dayOfMonth);
    const label = date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const tooltipWidth = 140;
    const tooltipHeight = 36;
    const padding = 8;
    const relativeX = event.clientX - containerRect.left;
    const relativeY = event.clientY - containerRect.top;
    const clampedX = Math.min(
      containerRect.width - padding,
      Math.max(tooltipWidth + padding, relativeX)
    );
    const clampedY = Math.min(
      containerRect.height - padding,
      Math.max(tooltipHeight + padding, relativeY)
    );
    setHoveredDayDisplay({
      label,
      x: clampedX,
      y: clampedY,
    });
  };

  const clearDayHover = () => {
    setHoveredDayDisplay(null);
  };

  const renderDayGrid = () => (
    <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6">
      <div
        className="grid gap-2 text-xs text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]"
        style={{
          gridTemplateColumns: `repeat(12, minmax(0, 1fr))`,
        }}
      >
        {months.map((monthIndex) => {
          const monthName = new Date(2020, monthIndex).toLocaleString(undefined, {
            month: "short",
          });
          const quarterColor =
            Math.floor(monthIndex / 3) % 2 === 0
              ? "text-[#5B8FF9]"
              : "text-[#9b59b6]";
          return (
            <span key={`month-${monthIndex}`} className={`text-center font-medium sm:font-bold ${quarterColor}`}>
              {monthName}
            </span>
          );
        })}
      </div>
      <div
        ref={dayGridRef}
        className="relative mt-2"
        onMouseLeave={clearDayHover}
      >
        {hoveredDayDisplay && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: hoveredDayDisplay.x,
              top: hoveredDayDisplay.y,
              transform: "translate(-100%, -100%)",
            }}
          >
            <span className="rounded-full border border-foreground bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-foreground shadow whitespace-nowrap">
              {hoveredDayDisplay.label}
            </span>
          </div>
        )}
        {days.map((dayOfMonth) => {
          return (
          <div
            key={`row-${dayOfMonth}`}
            className="grid items-center"
            style={{
              gridTemplateColumns: `repeat(12, minmax(0, 1fr))`,
              columnGap: "0.5rem",
            }}
          >
            {months.map((monthIndex) => {
              const key = `${year}-${monthIndex + 1}-${dayOfMonth}`;
              const storedValue = ratings[key];
              const hasValue =
                storedValue !== null && storedValue !== undefined;
              const currentValue = hasValue ? Math.min(storedValue!, scale.length - 1) : 0;
              const scaleEntry = scale[currentValue];
              const isDayOff = Boolean(dayOffs[key]);
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

                const isSelectedWeek = selectedWeekKey === currentWeek.weekKey;
                if (isSelectedWeek) {
                  const isFirstDayOfWeek =
                    currentWeek.dayKeys[0] === `${year}-${monthIndex + 1}-${dayOfMonth}`;
                  const isLastDayOfWeek =
                    currentWeek.dayKeys[currentWeek.dayKeys.length - 1] ===
                    `${year}-${monthIndex + 1}-${dayOfMonth}`;
                  let selectedWeekBorders = "";
                  if (isFirstDayOfWeek) {
                    selectedWeekBorders =
                      "border-t-2 border-t-slate-700 border-l-2 border-r-2 border-l-slate-700 border-r-slate-700";
                  } else if (isLastDayOfWeek) {
                    selectedWeekBorders =
                      "border-b-2 border-b-slate-700 border-l-2 border-r-2 border-l-slate-700 border-r-slate-700";
                  } else {
                    selectedWeekBorders = "border-l-2 border-r-2 border-l-slate-700 border-r-slate-700";
                  }
                  weekBorderClass = `${weekBorderClass} ${selectedWeekBorders}`;
                }
              }

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleCycle(monthIndex, dayOfMonth)}
                  onMouseEnter={(event) =>
                    handleDayHover(event, monthIndex, dayOfMonth)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      setRatings((prev) => ({ ...prev, [key]: null }));
                    }
                  }}
                  className={`h-4 w-full text-[10px] font-semibold text-transparent transition focus:text-transparent ${weekBorderClass} ${
                    isDayOff
                      ? "bg-[#8dc8e6]"
                      : hasValue
                        ? scaleEntry.color
                        : "bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
                  } ${
                    isToday
                      ? "ring-2 ring-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.4)]"
                      : ""
                  }`}
                  aria-label={`Day ${dayOfMonth} of ${new Date(2020, monthIndex).toLocaleString(undefined, {
                    month: "long",
                  })}, rating ${scaleEntry.label}`}
                >
                  {hasValue ? currentValue : ""}
                </button>
              );
            })}
          </div>
        );
        })}
      </div>
      <div className={`mt-6 flex items-center text-[10px] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:text-xs ${showLegend ? "justify-between" : "justify-end"}`}>
        {showLegend && (
          <div className="flex flex-col gap-2">
            <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.2em] sm:text-[10px]">
              Goals achieved (self-rated)
            </span>
            <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
              {scale.map((item) => (
                <div key={item.value} className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className={`h-3 w-3 rounded ${item.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] sm:h-4 sm:w-4`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={`flex items-start gap-2 ${showLegend ? "flex-col sm:flex-row sm:items-center sm:gap-3" : "flex-row items-center"}`}>
          {yearControl}
          {toggleButton}
          {dayOffControl}
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
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          }}
        >
          {months.map((monthIndex) => {
            const monthName = new Date(2020, monthIndex).toLocaleString(undefined, {
              month: "short",
            });
            const quarterColor =
              Math.floor(monthIndex / 3) % 2 === 0
                ? "text-[#5B8FF9]"
                : "text-[#9b59b6]";
            return (
              <span key={`week-month-${monthIndex}`} className={`text-center font-medium sm:font-bold ${quarterColor}`}>
                {monthName}
              </span>
            );
          })}
        </div>
        <div
          className="mt-4 grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          }}
        >
          {months.map((monthIndex) => (
            <div key={`month-col-${monthIndex}`} className="space-y-1 sm:space-y-2">
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
                const manualWeekKey = week.weekKey;
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
                        scale.length - 1,
                        Math.round(dayAverage ?? 0)
                      )
                    )
                  : manualScore !== null && manualScore !== undefined
                    ? Math.min(manualScore, scale.length - 1)
                    : null;
                const scaleClass =
                  colorIndex !== null && colorIndex !== undefined
                    ? scale[colorIndex].color
                    : "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]";
                const isSelectedWeek = selectedWeekKey === week.weekKey;
                const dayOffCount = week.dayKeys.reduce(
                  (count, dayKey) => count + (dayOffs[dayKey] ? 1 : 0),
                  0
                );
                const isFullWeekOff = dayOffCount === week.dayKeys.length;
                const hasAnyDayOff = dayOffCount > 0;
                const weekFillClass = isFullWeekOff ? "bg-[#8dc8e6]" : scaleClass;
                const dayOffIndicatorClass =
                  !isFullWeekOff && hasAnyDayOff ? "border-l-2 border-l-[#8dc8e6]" : "";
                return (
                  <div key={`week-card-${week.weekNumber}`}>
                    <button
                      type="button"
                      onClick={() => handleWeekCycle(week.weekKey, hasDayScores)}
                      onKeyDown={(e) => {
                        if (!hasDayScores && (e.key === "Delete" || e.key === "Backspace")) {
                          e.preventDefault();
                          const key = week.weekKey;
                          setRatings((prev) => ({ ...prev, [key]: null }));
                        }
                      }}
                      className={`flex h-5 w-full items-center justify-center rounded-sm border text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:h-4 ${
                        hasDayScores
                          ? "cursor-pointer"
                          : "hover:opacity-90"
                      } ${weekFillClass} border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] ${dayOffIndicatorClass} ${
                        isSelectedWeek ? "border-black" : ""
                      }`}
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
        <div className={`mt-6 flex items-center text-[10px] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:text-xs ${showLegend ? "justify-between" : "justify-end"}`}>
          {showLegend && (
            <div className="flex flex-col gap-2">
              <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.2em] sm:text-[10px]">
                Goals achieved (self-rated)
              </span>
              <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
                {scale.map((item) => (
                  <div key={item.value} className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className={`h-3 w-3 rounded ${item.color} border border-[color-mix(in_srgb,var(--foreground)_15%,transparent)] sm:h-4 sm:w-4`}
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        <div className={`flex items-start gap-2 ${showLegend ? "flex-col sm:flex-row sm:items-center sm:gap-3" : "flex-row items-center"}`}>
          {yearControl}
          {toggleButton}
          {dayOffControl}
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
    setScheduleEntries((prev) => {
      const dayEntries = prev[dayKey] ?? [];
      const { start, end } = nextEntryTimes(dayEntries);
      const defaultTitle = "New task";
      return {
        ...prev,
        [dayKey]: [
          ...dayEntries,
          createEntryWithColor({ time: start, endTime: end, title: defaultTitle }),
        ],
      };
    });
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
              <div className="grid gap-4 sm:grid-cols-2">
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
const createWeeklyNoteEntry = (entry?: Partial<WeeklyNoteEntry>): WeeklyNoteEntry => ({
  content: entry?.content ?? "",
  dos: entry?.dos ?? "",
  donts: entry?.donts ?? "",
});

const normalizeWeeklyNotes = (
  notes: Record<string, Partial<WeeklyNoteEntry>> | undefined
): Record<string, WeeklyNoteEntry> => {
  const normalized: Record<string, WeeklyNoteEntry> = {};
  if (!notes) {
    return normalized;
  }
  Object.entries(notes).forEach(([key, entry]) => {
    normalized[key] = createWeeklyNoteEntry(entry);
  });
  return normalized;
};

const buildDemoWeeklyNotes = (
  year: number,
  weekStartDay: WeekdayIndex
): Record<string, Partial<WeeklyNoteEntry>> => {
  const notes: Record<string, Partial<WeeklyNoteEntry>> = {};
  buildWeeksForYear(year, weekStartDay).forEach((week) => {
    notes[week.weekKey] = demoWeeklyNoteTemplate;
  });
  return notes;
};
