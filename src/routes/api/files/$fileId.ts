import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { findFile, openFile } from "#/modules/files/files.server";
import { fileRights } from "#/modules/files/schema";

// Downloads (spec §9): the only way to a file's bytes. Needs a session, the
// file must be in the session's active workspace, and the role must allow
// reading its record (or, for workspace folders, reading files). Never a
// public URL; always sent as an attachment so the browser never runs it.

const idSchema = z.uuid();

function plain(status: number, text: string) {
	return new Response(text, {
		status,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

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
				if (!session) return plain(401, "Unauthorized");
				const workspaceId = session.session.activeOrganizationId;
				if (!workspaceId) return plain(403, "No active workspace");
				if (!idSchema.safeParse(params.fileId).success)
					return plain(404, "Not found");

				let row: Awaited<ReturnType<typeof findFile>>;
				try {
					row = await findFile(workspaceId, params.fileId);
				} catch {
					return plain(404, "Not found");
				}
				const allowed = await auth.api.hasPermission({
					headers: request.headers,
					body: {
						organizationId: workspaceId,
						permissions: fileRights(row, "read"),
					},
				});
				// Same answer as a missing file: no hint that it exists
				if (!allowed.success) return plain(404, "Not found");

				const object = await openFile(row);
				if (!object) return plain(404, "Not found");
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
