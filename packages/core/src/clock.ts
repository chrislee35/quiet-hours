import type { Config } from "./config.ts";

export interface GameTime {
  /** 1-based day index. */
  day: number;
  /** Minutes since midnight, 0..1439 (whole minutes). */
  minuteOfDay: number;
  hour: number;
  minute: number;
  isCurfew: boolean;
  isQuietHours: boolean;
}

const MINUTES_PER_DAY = 1440;

/** True when `minute` lies in [start, end), where the window may wrap past midnight. */
export function inWindow(minute: number, start: number, end: number): boolean {
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Derives game time purely from the tick count (CORE-3). One source of truth for all schedules. */
export function gameTimeAt(tick: number, config: Config): GameTime {
  const c = config.clock;
  const elapsedMinutes = Math.floor(
    (tick / config.sim.ticksPerSecond) * c.gameMinutesPerRealSecond,
  );
  const total = c.startMinuteOfDay + elapsedMinutes;
  const day = c.startDay + Math.floor(total / MINUTES_PER_DAY);
  const minuteOfDay = total % MINUTES_PER_DAY;
  return {
    day,
    minuteOfDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    isCurfew: inWindow(minuteOfDay, c.curfewStartMinute, c.curfewEndMinute),
    isQuietHours: inWindow(minuteOfDay, c.quietHoursStartMinute, c.quietHoursEndMinute),
  };
}

export function formatTime(t: GameTime): string {
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `Day ${t.day} ${hh}:${mm}`;
}
