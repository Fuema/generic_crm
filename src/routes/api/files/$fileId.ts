import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { authorizeDownload, openFile } from "#/modules/files/files.server";

// Downloads (spec §9): the only way to a file's bytes. authorizeDownload
// checks the session, the workspace and the right on the file's record. Never
// a public URL; always sent as an attachment so the browser never runs it.

function plain(status: number, text: string) {
	return new Response(text, {
		status,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

const STATUS_TEXT = {
	401: "Unauthorized",
	403: "No active workspace",
	404: "Not found",
} as const;

// RFC 6266: an ASCII fallback plus the UTF-8 name
function disposition(name: string) {
	const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const Route = createFileRoute("/api/files/$fileId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				const workspaceId = session?.session.activeOrganizationId ?? null;
				const access = session
					? {
							workspaceId,
							can: async (permissions: Record<string, string[]>) =>
								workspaceId
									? (
											await auth.api.hasPermission({
												headers: request.headers,
												body: { organizationId: workspaceId, permissions },
											})
										).success
									: false,
						}
					: null;
				// A database or storage failure answers a plain 500, never its details
				let result: Awaited<ReturnType<typeof authorizeDownload>>;
				let object: Awaited<ReturnType<typeof openFile>> = null;
				try {
					result = await authorizeDownload(access, params.fileId);
					if (result.ok) object = await openFile(result.row);
				} catch {
					return plain(500, "Something went wrong");
				}
				if (!result.ok) return plain(result.status, STATUS_TEXT[result.status]);

				const { row } = result;
				if (!object) return plain(404, STATUS_TEXT[404]);
				return new Response(object.body, {
					headers: {
						"Content-Type": row.contentType,
						"Content-Length": String(object.size),
						"Content-Disposition": disposition(row.name),
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy": "default-src 'none'; sandbox",
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
