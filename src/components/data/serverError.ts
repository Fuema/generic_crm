import { m } from "#/paraglide/messages.js";

// Turns a failed server-function call into a message for the user. Our own
// errors are Responses whose body is already in the request's language.
export async function serverErrorMessage(error: unknown) {
	if (error instanceof Response) {
		if (error.status === 401) return m.error_session_expired();
		if (error.status === 403) return m.error_not_allowed();
		const text = await error.text().catch(() => "");
		return text || m.error_request_failed({ status: error.status });
	}
	return error instanceof Error ? error.message : m.error_generic();
}
