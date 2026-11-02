import { db } from "#/db/index";
import { event } from "#/db/schema";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";

// Server-only: import from server code, never from routes or components.

export type Actor =
	| { type: "member"; id: string }
	| { type: "system"; id?: null };

export type FieldChanges = Record<string, { from: Json; to: Json }>;

// The insert for one event. Callers put it in the same db.batch as the change,
// so a change and its event are written together or not at all (spec §11.1).
export function eventInsert(
	workspaceId: string,
	actor: Actor,
	e: {
		type: string;
		subjectType: string;
		subjectId: string;
		payload?: Record<string, Json>;
	},
) {
	return db.insert(event).values({
		id: uuidv7(),
		workspaceId,
		type: e.type,
		subjectType: e.subjectType,
		subjectId: e.subjectId,
		actorType: actor.type,
		actorId: actor.id ?? null,
		payload: e.payload ?? {},
	});
}

// Dates become ISO strings and objects JSON, so values compare and store as JSON
function toJson(value: unknown): Json {
	if (value instanceof Date) return value.toISOString();
	if (value === undefined) return null;
	return value as Json;
}

// Fields whose value differs between the stored row and the new values
export function changedFields<T extends Record<string, unknown>>(
	before: T,
	after: Partial<T>,
) {
	const changes: FieldChanges = {};
	for (const key of Object.keys(after)) {
		const from = toJson(before[key]);
		const to = toJson(after[key]);
		if (JSON.stringify(from) !== JSON.stringify(to)) {
			changes[key] = { from, to };
		}
	}
	return changes;
}
