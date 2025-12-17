/**
 * Tests for localStorage utilities
 */

import { filterRecentScheduleEntries } from '../localStorage-utils';

describe('localStorage-utils', () => {
  describe('filterRecentScheduleEntries', () => {
    it('should keep entries from the last 90 days', () => {
      const today = new Date();
      const recent = new Date();
      recent.setDate(today.getDate() - 30); // 30 days ago

      const old = new Date();
      old.setDate(today.getDate() - 100); // 100 days ago

      const entries = {
        [`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`]: ['entry1'],
        [`${recent.getFullYear()}-${recent.getMonth() + 1}-${recent.getDate()}`]: ['entry2'],
        [`${old.getFullYear()}-${old.getMonth() + 1}-${old.getDate()}`]: ['entry3'],
      };

      const filtered = filterRecentScheduleEntries(entries, 90);

      expect(filtered).toHaveProperty(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
      expect(filtered).toHaveProperty(`${recent.getFullYear()}-${recent.getMonth() + 1}-${recent.getDate()}`);
      expect(filtered).not.toHaveProperty(`${old.getFullYear()}-${old.getMonth() + 1}-${old.getDate()}`);
    });

    it('should keep all entries if they are within retention period', () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const entries = {
        [`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`]: ['entry1'],
        [`${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`]: ['entry2'],
      };

      const filtered = filterRecentScheduleEntries(entries, 90);

      expect(Object.keys(filtered).length).toBe(2);
    });

    it('should handle empty object', () => {
      const filtered = filterRecentScheduleEntries({}, 90);
      expect(Object.keys(filtered).length).toBe(0);
    });

    it('should handle entries with invalid date format', () => {
      const today = new Date();
      const entries = {
        [`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`]: ['entry1'],
        'invalid-date': ['entry2'],
      };

      const filtered = filterRecentScheduleEntries(entries, 90);

      // Should keep both - invalid dates are kept as fallback
      expect(Object.keys(filtered).length).toBe(2);
    });
  });
});
