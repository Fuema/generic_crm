import handler from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

// Every request runs inside Paraglide's middleware, which detects the locale
// (cookie, then the browser's languages, then English) and keeps it per request
export default {
	fetch(request: Request): Promise<Response> {
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
};
