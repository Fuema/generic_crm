import { describe, expect, test } from "bun:test";
import {
	addDays,
	dayKeyLocal,
	dayKeyUTC,
	fromStoredISO,
	itemDayKey,
	startOfWeek,
	step,
	toStoredISO,
	visibleDays,
} from "#/modules/tasks/calendar";

// These tests hold in any time zone: Bun on Windows ignores TZ=, so they can't
// pin one (spec §17, pitfall 8).

describe("all-day dates", () => {
	test("are stored at 12:00 UTC", () => {
		expect(toStoredISO("2026-03-08", "", true)).toBe(
			"2026-03-08T12:00:00.000Z",
		);
	});

	test("keep their calendar day when read back", () => {
		const stored = toStoredISO("2026-12-31", "", true);
		expect(fromStoredISO(stored, true)).toEqual({
			date: "2026-12-31",
			time: "",
		});
		expect(itemDayKey(stored, true)).toBe("2026-12-31");
	});
});

describe("timed dates", () => {
	test("round-trip through storage in local time", () => {
		const stored = toStoredISO("2026-07-14", "16:45", false);
		expect(fromStoredISO(stored, false)).toEqual({
			date: "2026-07-14",
			time: "16:45",
		});
		expect(itemDayKey(stored, false)).toBe("2026-07-14");
	});

	test("default to 09:00 when no time is given", () => {
		const stored = toStoredISO("2026-07-14", "", false);
		expect(fromStoredISO(stored, false).time).toBe("09:00");
	});

	test("empty values read back as empty inputs", () => {
		expect(fromStoredISO(null, false)).toEqual({ date: "", time: "" });
	});
});

describe("day keys", () => {
	test("UTC key ignores the local time zone", () => {
		expect(dayKeyUTC(new Date("2026-01-05T23:30:00.000Z"))).toBe("2026-01-05");
	});

	test("local key matches the local calendar day", () => {
		expect(dayKeyLocal(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
	});
});

describe("calendar views", () => {
	test("weeks start on Monday", () => {
		// Sunday 2026-11-08 belongs to the week starting Monday 2026-11-02
		expect(dayKeyLocal(startOfWeek(new Date(2026, 10, 8)))).toBe("2026-11-02");
		expect(dayKeyLocal(startOfWeek(new Date(2026, 10, 2)))).toBe("2026-11-02");
	});

	test("show 1, 7 or 42 consecutive days", () => {
		const anchor = new Date(2026, 1, 15);
		expect(visibleDays("day", anchor)).toHaveLength(1);
		const week = visibleDays("week", anchor);
		expect(week).toHaveLength(7);
		const month = visibleDays("month", anchor);
		expect(month).toHaveLength(42);
		for (let i = 1; i < month.length; i++) {
			expect(dayKeyLocal(month[i])).toBe(dayKeyLocal(addDays(month[i - 1], 1)));
		}
	});
});

describe("the days view", () => {
	test("shows the chosen number of days from the anchor, not from Monday", () => {
		// Wednesday 2026-11-04
		const days = visibleDays("days", new Date(2026, 10, 4), 3);
		expect(days.map(dayKeyLocal)).toEqual([
			"2026-11-04",
			"2026-11-05",
			"2026-11-06",
		]);
	});

	test("moves by the number of days shown", () => {
		const anchor = new Date(2026, 10, 4);
		expect(dayKeyLocal(step("days", anchor, 1, 5))).toBe("2026-11-09");
		expect(dayKeyLocal(step("days", anchor, -1, 5))).toBe("2026-10-30");
		// Other views ignore the count
		expect(dayKeyLocal(step("week", anchor, 1, 5))).toBe("2026-11-11");
	});
});
