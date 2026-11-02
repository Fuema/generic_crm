import { z } from "zod";

export const CALENDAR_DAY_CHOICES = Array.from({ length: 14 }, (_, i) => i + 1);
export const TASK_DUE_CHOICES = [1, 3, 7, 14, 30] as const;

export const DEFAULT_PREFERENCES = {
	calendarDays: 3,
	taskDueDays: null,
} as const;

export const preferencesInputSchema = z
	.object({
		calendarDays: z.number().int().min(1).max(14),
		// null = show all tasks
		taskDueDays: z.number().int().min(1).max(365).nullable(),
	})
	.partial();
export type PreferencesInput = z.infer<typeof preferencesInputSchema>;
