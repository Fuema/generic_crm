import { afterAll, beforeAll, expect, test } from "bun:test";
import * as prefs from "#/modules/preferences/preferences.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Personal preferences are keyed by the user alone and never mix between people.
let a: Workspace;
let b: Workspace;

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pa"), createWorkspace("pb")]);
});

afterAll(cleanup);

test("defaults, partial updates and isolation between people", async () => {
	expect(await prefs.getPreferences(a.userId)).toEqual({
		calendarDays: 3,
		taskDueDays: null,
	});
	await prefs.setPreferences(a.userId, { calendarDays: 5 });
	await prefs.setPreferences(a.userId, { taskDueDays: 7 });
	expect(await prefs.getPreferences(a.userId)).toEqual({
		calendarDays: 5,
		taskDueDays: 7,
	});
	// Someone else is unaffected
	expect(await prefs.getPreferences(b.userId)).toEqual({
		calendarDays: 3,
		taskDueDays: null,
	});
	await prefs.setPreferences(a.userId, { taskDueDays: null });
	expect((await prefs.getPreferences(a.userId)).taskDueDays).toBeNull();
});
