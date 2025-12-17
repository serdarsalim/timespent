/**
 * Utilities for managing localStorage with size constraints
 */

// Keep only the last N days of schedule entries in localStorage
const SCHEDULE_RETENTION_DAYS = 90;

/**
 * Filters schedule entries to keep only recent days (last N days)
 * This prevents localStorage quota from being exceeded over time
 */
export function filterRecentScheduleEntries<T>(
  entries: Record<string, T>,
  retentionDays: number = SCHEDULE_RETENTION_DAYS
): Record<string, T> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  cutoffDate.setHours(0, 0, 0, 0);

  const filtered: Record<string, T> = {};

  for (const [dayKey, value] of Object.entries(entries)) {
    // Parse dayKey format: "YYYY-M-D"
    const match = dayKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      // Keep entries with invalid format (shouldn't happen, but be safe)
      filtered[dayKey] = value;
      continue;
    }

    const [, year, month, day] = match;
    const entryDate = new Date(
      parseInt(year!),
      parseInt(month!) - 1,
      parseInt(day!)
    );

    // Keep only entries from cutoff date onwards
    if (entryDate >= cutoffDate) {
      filtered[dayKey] = value;
    }
  }

  return filtered;
}

/**
 * Safely sets an item in localStorage with quota error handling
 * If quota is exceeded, it attempts to clean up old data and retry
 */
export function safeLocalStorageSetItem(
  key: string,
  value: string,
  onQuotaExceeded?: () => void
): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      console.error(
        `localStorage quota exceeded for key: ${key}`,
        `Size: ${value.length} characters`,
        error
      );

      // Call the optional cleanup callback
      if (onQuotaExceeded) {
        onQuotaExceeded();
      }

      return false;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Cleans up old schedule entries from localStorage on app load
 * This ensures we don't carry forward accumulated data from previous versions
 */
export function cleanupOldScheduleEntries(): void {
  try {
    const stored = window.localStorage.getItem("timespent-schedule-entries");
    if (!stored) return;

    const parsed = JSON.parse(stored) as Record<string, any>;
    const filtered = filterRecentScheduleEntries(parsed);

    // Only update if we actually removed entries
    const originalSize = Object.keys(parsed).length;
    const filteredSize = Object.keys(filtered).length;

    if (filteredSize < originalSize) {
      console.log(
        `Cleaned up schedule entries: ${originalSize} → ${filteredSize} days (removed ${originalSize - filteredSize} old days)`
      );
      window.localStorage.setItem(
        "timespent-schedule-entries",
        JSON.stringify(filtered)
      );
    }
  } catch (error) {
    console.error("Failed to cleanup old schedule entries", error);
    // If cleanup fails due to quota, just remove the key entirely
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      console.warn("Removing corrupted schedule entries from localStorage");
      window.localStorage.removeItem("timespent-schedule-entries");
    }
  }
}

/**
 * Emergency cleanup - removes all timespent localStorage data
 * Use this when localStorage is completely corrupted
 */
export function emergencyCleanup(): void {
  const keys = Object.keys(window.localStorage);
  const timespentKeys = keys.filter(key =>
    key.startsWith("timespent-") || key.startsWith("slmtrack-")
  );

  console.warn(`Emergency cleanup: removing ${timespentKeys.length} localStorage keys`);
  timespentKeys.forEach(key => {
    window.localStorage.removeItem(key);
    console.log(`Removed: ${key}`);
  });
}

/**
 * Gets the current size of localStorage usage in a human-readable format
 */
export function getLocalStorageSize(): {
  totalBytes: number;
  totalKB: number;
  items: Array<{ key: string; bytes: number; kb: number }>;
} {
  let totalBytes = 0;
  const items: Array<{ key: string; bytes: number; kb: number }> = [];

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key) {
      const value = window.localStorage.getItem(key) || "";
      const bytes = new Blob([value]).size;
      totalBytes += bytes;
      items.push({
        key,
        bytes,
        kb: Math.round(bytes / 1024),
      });
    }
  }

  return {
    totalBytes,
    totalKB: Math.round(totalBytes / 1024),
    items: items.sort((a, b) => b.bytes - a.bytes),
  };
}
