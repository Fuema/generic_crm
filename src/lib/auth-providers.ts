import { createServerFn } from "@tanstack/react-start";

export type SocialProvider = "google" | "github";

// Tells the forms which social buttons to show, based on which credentials are configured.
// Kept separate from auth.ts so client code never imports the server config.
export const getSocialProviders = createServerFn({ method: "GET" }).handler(
	async (): Promise<SocialProvider[]> => {
		const providers: SocialProvider[] = [];
		if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
			providers.push("google");
		if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
			providers.push("github");
		return providers;
	},
);

// Only allow same-site relative paths, so ?redirect= can't send users to another site
export function safeRedirect(target: unknown, fallback = "/dashboard") {
	if (typeof target !== "string") return fallback;
	if (
		!target.startsWith("/") ||
		target.startsWith("//") ||
		target.startsWith("/\\")
	)
		return fallback;
	return target;
}
