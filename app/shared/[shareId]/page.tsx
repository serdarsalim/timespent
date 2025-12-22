"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ProductivityScaleEntry = {
  value: number;
  label: string;
  color: string;
};

type WeekMeta = {
  weekNumber: number;
  months: number[];
  dayKeys: string[];
  primaryMonth: number;
  rangeLabel: string;
  weekKey: string;
  weekStart: Date;
};

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
    };
    goals: SharedGoal[];
    productivityRatings: Record<string, number | null>;
    weeklyNotes: Record<string, SharedWeeklyNote>;
  };
};

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  { ssr: false }
);
const TINYMCE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/tinymce/8.1.2/tinymce.min.js";

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

const formatDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const formatWeekKey = (weekStart: Date, weekStartDay: WeekdayIndex) =>
  `week-${weekStartDay}-${formatDayKey(weekStart)}`;

const getWeekStart = (date: Date, weekStartDay: WeekdayIndex = 1) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day - weekStartDay + 7) % 7;
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

type ProductivityGridProps = {
  year: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;
  ratings: Record<string, number | null>;
  scale: ProductivityScaleEntry[];
  mode: "day" | "week";
  showLegend: boolean;
  selectedWeekKey: string | null;
  setSelectedWeekKey: React.Dispatch<React.SetStateAction<string | null>>;
  weekStartDay: WeekdayIndex;
  onToggleMode: () => void;
};

const ProductivityGrid = ({
  year,
  setYear,
  ratings,
  scale,
  mode,
  showLegend,
  selectedWeekKey,
  setSelectedWeekKey,
  weekStartDay,
  onToggleMode,
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

              const isPreviousDayToday =
                today.getFullYear() === year &&
                today.getMonth() === monthIndex &&
                today.getDate() === dayOfMonth - 1;

              let weekBorderClass = "";
              const currentWeek = weeks.find((week) =>
                week.dayKeys.includes(`${year}-${monthIndex + 1}-${dayOfMonth}`)
              );

              if (currentWeek) {
                const isFirstInMonth = !currentWeek.dayKeys.some((dayKey) => {
                  const [y, m, d] = dayKey.split("-").map(Number);
                  return y === year && m === monthIndex + 1 && d! < dayOfMonth;
                });

                const nextDayInWeek =
                  dayOfMonth < daysInMonth(year, monthIndex) &&
                  currentWeek.dayKeys.includes(
                    `${year}-${monthIndex + 1}-${dayOfMonth + 1}`
                  );

                const borderTop = isPreviousDayToday
                  ? "border-t-2 border-t-yellow-400"
                  : isFirstInMonth
                    ? "border-t border-t-gray-400"
                    : "border-t-[0.5px] border-t-gray-300";
                const borderBottom = !nextDayInWeek
                  ? "border-b border-b-gray-400"
                  : "border-b-[0.5px] border-b-gray-300";
                const borderSides =
                  "border-l border-r border-l-gray-400 border-r-gray-400";

                weekBorderClass = `${borderTop} ${borderBottom} ${borderSides}`;

                const isSelectedWeek = selectedWeekKey === currentWeek.weekKey;
                if (isSelectedWeek) {
                  const isFirstDayOfWeek =
                    currentWeek.dayKeys[0] ===
                    `${year}-${monthIndex + 1}-${dayOfMonth}`;
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
                    selectedWeekBorders =
                      "border-l-2 border-r-2 border-l-slate-700 border-r-slate-700";
                  }
                  weekBorderClass = `${weekBorderClass} ${selectedWeekBorders}`;
                }
              }

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    if (currentWeek) {
                      setSelectedWeekKey(currentWeek.weekKey);
                    }
                  }}
                  onMouseEnter={(event) =>
                    handleDayHover(event, monthIndex, dayOfMonth)
                  }
                  className={`h-4 w-full text-[10px] font-semibold text-transparent transition focus:text-transparent ${weekBorderClass} ${
                    hasValue
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
          <button
            type="button"
            onClick={onToggleMode}
            className="flex items-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
          >
            {mode === "week" ? "Week" : "Day"}
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
                return (
                  <div key={`week-card-${week.weekNumber}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedWeekKey(week.weekKey)}
                      className={`flex h-5 w-full items-center justify-center rounded-sm border text-[10px] font-semibold text-transparent transition focus:text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] sm:h-4 ${
                        hasDayScores
                          ? "cursor-pointer"
                          : "hover:opacity-90"
                      } ${scaleClass} border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] ${
                        isSelectedWeek ? "border-black" : ""
                      }`}
                      title={`${week.rangeLabel}${hasDayScores ? " (rating locked from daily view)" : ""}`}
                      aria-label={
                        hasDayScores
                          ? `Week ${week.weekNumber} ${week.rangeLabel}, averaged score ${dayAverage}, click to select week`
                          : `Week ${week.weekNumber} ${week.rangeLabel}, current score ${manualScore ?? "unset"}, click to select week`
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
          <button
            type="button"
            onClick={onToggleMode}
            className="flex items-center rounded-full border border-[color-mix(in_srgb,var(--foreground)_30%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--foreground)_80%,transparent)] transition hover:border-foreground"
            >
              {mode === "week" ? "Week" : "Day"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return mode === "day" ? renderDayGrid() : renderWeekGrid();
};

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
  const dosDontsPanel = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ backgroundColor: "#e8f5e9" }}>
        <span className="text-xs uppercase tracking-[0.3em] text-[#0f172a]">Do&apos;s</span>
        <p className="text-[13px] text-[#0f172a] sm:text-sm whitespace-pre-wrap">
          {selectedWeekEntry?.dos ?? ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ backgroundColor: "#ffebee" }}>
        <span className="text-xs uppercase tracking-[0.3em] text-[#0f172a]">Don&apos;ts</span>
        <p className="text-[13px] text-[#0f172a] sm:text-sm whitespace-pre-wrap">
          {selectedWeekEntry?.donts ?? ""}
        </p>
      </div>
    </div>
  );

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground">
      {data.viewerIsOwner && (
        <div className="w-full border-b border-[color-mix(in_srgb,var(--foreground)_18%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] px-4 py-3 text-center text-[11px] uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          Preview — this is what your recipient sees
        </div>
      )}
      <main className="flex flex-1 items-start justify-center px-4">
        <div className="w-full py-6 text-center">
          <div className="mb-6 text-sm uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)]">
            Shared by {data.owner.personName || data.owner.email || "Account"}
          </div>
          {selectedWeek && (
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.4em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                Week of
              </div>
              <h1 className="text-base sm:text-lg font-semibold uppercase tracking-[0.3em] text-foreground">
                {selectedWeek.rangeLabel}
              </h1>
            </div>
          )}
          <section className="mx-auto grid max-w-480 gap-8 text-left lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4 order-2 lg:order-1">
              <ProductivityGrid
                year={productivityYear}
                setYear={setProductivityYear}
                ratings={data.productivityRatings}
                scale={scale}
                mode={productivityMode}
                showLegend
                selectedWeekKey={selectedWeekKey}
                setSelectedWeekKey={setSelectedWeekKey}
                weekStartDay={data.profile.weekStartDay}
                onToggleMode={() =>
                  setProductivityMode((prev) => (prev === "day" ? "week" : "day"))
                }
              />
              {productivityMode === "week" ? (
                <div className="mt-4 hidden lg:block">{dosDontsPanel}</div>
              ) : null}
            </div>
            <div className="flex flex-col rounded-3xl px-4 pb-4 pt-0 order-1 lg:order-2">
              {productivityMode === "day" ? (
                <div className="mb-4">{dosDontsPanel}</div>
              ) : null}
              {productivityMode === "week" ? (
                <div className="mb-4 lg:hidden">{dosDontsPanel}</div>
              ) : null}
              <div className="flex-1 rounded-2xl px-4 pt-4 pb-4" style={{ backgroundColor: "var(--card-muted-bg)" }}>
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
                      plugins: "lists",
                      readonly: true,
                      skin: "oxide",
                      content_css: false,
                      toolbar: false,
                      quickbars_selection_toolbar: false,
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
                    } as Record<string, unknown>
                  }
                />
              </div>
            </div>
          </section>
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
        </div>
      </main>
    </div>
  );
}
