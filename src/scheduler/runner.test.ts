import { describe, it, expect } from 'vitest';
import { isWithinScheduleWindow } from './runner.js';

describe('isWithinScheduleWindow', () => {
  it('returns true when hour is within window', () => {
    expect(isWithinScheduleWindow(8, 7, 19)).toBe(true);
    expect(isWithinScheduleWindow(18, 7, 19)).toBe(true);
  });

  it('returns false when hour is outside window', () => {
    expect(isWithinScheduleWindow(6, 7, 19)).toBe(false);
    expect(isWithinScheduleWindow(20, 7, 19)).toBe(false);
    expect(isWithinScheduleWindow(19, 7, 19)).toBe(false);
  });
});
