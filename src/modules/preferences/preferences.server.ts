import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { userPreference } from "#/db/schema";
import { DEFAULT_PREFERENCES, type PreferencesInput } from "./schema";

// Server-only. A person's own display preferences; nothing here is shared with
// other members, so the user id (from the session) is the only key.

export async function getPreferences(userId: string) {
	const [row] = await db
		.select({
			calendarDays: userPreference.calendarDays,
			taskDueDays: userPreference.taskDueDays,
		})
		.from(userPreference)
		.where(eq(userPreference.userId, userId))
		.limit(1);
	return row ?? { ...DEFAULT_PREFERENCES };
}

export async function setPreferences(userId: string, input: PreferencesInput) {
	const current = await getPreferences(userId);
	const next = { ...current, ...input };
	await db
		.insert(userPreference)
		.values({ userId, ...next })
		.onConflictDoUpdate({
			target: userPreference.userId,
			// Only what was sent, so two tabs saving different settings don't clash
			set: { ...input, updatedAt: new Date() },
		});
	return next;
}
