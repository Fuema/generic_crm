import { createServerFn } from "@tanstack/react-start";
import { requireSession } from "#/lib/auth-session";
import * as data from "./preferences.server";
import { preferencesInputSchema } from "./schema";

// The signed-in person's own preferences; the user id always comes from the session
export const getPreferences = createServerFn({ method: "GET" })
	.middleware([requireSession])
	.handler(({ context }) => data.getPreferences(context.session.user.id));

export const setPreferences = createServerFn({ method: "POST" })
	.middleware([requireSession])
	.validator(preferencesInputSchema)
	.handler(({ data: input, context }) =>
		data.setPreferences(context.session.user.id, input),
	);
