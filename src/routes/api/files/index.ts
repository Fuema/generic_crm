import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { uploadFile } from "#/modules/files/files.server";
import { FILE_LIMITS, uploadTargetSchema } from "#/modules/files/schema";
import { SUBJECT_RESOURCE } from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";

// Uploads (spec §9). The body is the file itself; nothing of it is read until
// the declared size, the origin, the session and the right have been checked,
// and then it is streamed to storage (never held in memory as a whole).
// Target (JSON) in ?target=, the name in X-File-Name (URI-encoded). A plain
// HTML form can't send that header, and another site's script would need a
// CORS preflight this route never answers, so cross-site posts fail.

function plain(status: number, text: string) {
	return new Response(text, {
		status,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

export const Route = createFileRoute("/api/files/")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const url = new URL(request.url);
				const origin = request.headers.get("Origin");
				if (origin && origin !== url.origin)
					return plain(403, m.error_not_allowed());

				const size = Number(request.headers.get("Content-Length"));
				if (!Number.isInteger(size) || size <= 0)
					return plain(411, m.error_file_missing());
				if (size > FILE_LIMITS.maxFileBytes)
					return plain(413, m.error_file_too_large());

				let name: string;
				let raw: unknown;
				try {
					name = decodeURIComponent(request.headers.get("X-File-Name") ?? "");
					raw = JSON.parse(url.searchParams.get("target") ?? "");
				} catch {
					return plain(400, m.error_file_missing());
				}
				const target = uploadTargetSchema.safeParse(raw);
				if (!name || !target.success || !request.body)
					return plain(400, m.error_file_missing());

				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return plain(401, m.error_session_expired());
				const workspaceId = session.session.activeOrganizationId;
				if (!workspaceId) return plain(403, m.error_not_allowed());
				const allowed = await auth.api.hasPermission({
					headers: request.headers,
					body: {
						organizationId: workspaceId,
						permissions:
							target.data.kind === "record"
								? { [SUBJECT_RESOURCE[target.data.subjectType]]: ["update"] }
								: { file: ["create"] },
					},
				});
				if (!allowed.success) return plain(403, m.error_not_allowed());

				try {
					const created = await uploadFile(
						workspaceId,
						{ type: "member", id: session.user.id },
						target.data,
						{ name, size, body: request.body },
					);
					return Response.json(created, {
						headers: { "Cache-Control": "no-store" },
					});
				} catch (error) {
					if (error instanceof Response)
						return plain(error.status, await error.text());
					throw error;
				}
			},
		},
	},
});
