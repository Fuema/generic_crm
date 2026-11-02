// Calendar date helpers. Pure functions, safe in the browser and on the server.
//
// Time zones: timed items are stored as UTC instants and shown in the viewer's
// local time. All-day items are stored at 12:00 UTC on their date and read back
// with their UTC date, so an all-day task never slides to a neighbouring day.

import type { CalendarView } from "./schema";

export type DayKey = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKeyLocal(d: Date): DayKey {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKeyUTC(d: Date): DayKey {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Which calendar day an item belongs to
export function itemDayKey(at: Date | string, allDay: boolean): DayKey {
	const d = new Date(at);
	return allDay ? dayKeyUTC(d) : dayKeyLocal(d);
}

export function parseDayKey(key: DayKey): Date {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
	const r = new Date(d);
	r.setDate(r.getDate() + n);
	return r;
}

export function addMonths(d: Date, n: number) {
	return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

// Weeks start on Monday
export function startOfWeek(d: Date) {
	const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	return addDays(r, -((r.getDay() + 6) % 7));
}

// The days a view shows: 1, 7, or a full 6-week month grid (42 days)
export function visibleDays(view: CalendarView, anchor: Date): Date[] {
	if (view === "day")
		return [
			new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()),
		];
	if (view === "week")
		return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
	const first = startOfWeek(
		new Date(anchor.getFullYear(), anchor.getMonth(), 1),
	);
	return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function step(view: CalendarView, anchor: Date, dir: 1 | -1) {
	if (view === "day") return addDays(anchor, dir);
	if (view === "week") return addDays(anchor, 7 * dir);
	return addMonths(anchor, dir);
}

// Query range for the visible days, padded by a day on each side so items
// near midnight in any time zone are included; the browser then places them
export function queryRange(days: Date[]) {
	const from = addDays(days[0], -1);
	const to = addDays(days[days.length - 1], 2);
	return { from: from.toISOString(), to: to.toISOString() };
}

// Date + optional time (local) -> ISO for storage
export function toStoredISO(date: string, time: string, allDay: boolean) {
	if (allDay) return `${date}T12:00:00.000Z`;
	const [y, m, d] = date.split("-").map(Number);
	const [hh, mm] = (time || "09:00").split(":").map(Number);
	return new Date(y, m - 1, d, hh, mm).toISOString();
}

// Stored ISO -> date and time inputs (local), the inverse of toStoredISO
export function fromStoredISO(iso: string | Date | null, allDay: boolean) {
	if (!iso) return { date: "", time: "" };
	const d = new Date(iso);
	if (allDay) return { date: dayKeyUTC(d), time: "" };
	return {
		date: dayKeyLocal(d),
		time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
	};
}

export function formatTime(at: Date | string) {
	return new Date(at).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}
