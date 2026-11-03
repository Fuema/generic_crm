import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWorkspace } from "#/lib/authz";
import {
	companySearchSchema,
	contactSearchSchema,
} from "#/modules/contacts/schema";
import { assertPermission, hasPermission } from "#/platform/permissions.server";
import { CSV_OBJECT_KEYS } from "./columns";
import { CSV_LIMITS } from "./csv";
import * as data from "./transfer.server";

// CSV export and import. Exporting needs read access to the record type;
// importing needs create access (and update access to update existing records).
// The browser reads the file and sends it in batches of rows; the server checks
// every row itself and never trusts the browser's preview.

export const exportCsv = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(
		z.discriminatedUnion("objectKey", [
			z.object({
				objectKey: z.literal("contact"),
				search: contactSearchSchema,
			}),
			z.object({
				objectKey: z.literal("company"),
				search: companySearchSchema,
			}),
		]),
	)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, {
			[input.objectKey]: ["read"],
		});
		return data.exportCsv(context.workspaceId, input.objectKey, input.search);
	});

const cells = (max: number) => z.array(z.string().max(max)).max(100);
// Earlier rows only carry emails, domains and unique values (up to 255 characters)
const keyCells = cells(320);

export const importCsv = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(
		z
			.object({
				objectKey: z.enum(CSV_OBJECT_KEYS),
				// This batch, and where it starts in the file (0 = first row after
				// the header)
				rows: z.array(cells(2000)).min(1).max(CSV_LIMITS.importBatch),
				start: z.number().int().min(0).max(CSV_LIMITS.importRows),
				// Earlier rows of the file, for duplicates inside the file
				earlier: z.array(keyCells).max(CSV_LIMITS.importRows),
				// One entry per column: a field id, or "" to ignore the column
				mapping: z.array(z.string().max(60)).max(100),
				mode: z.enum(["skip", "update"]),
				dryRun: z.boolean(),
			})
			.refine((d) => d.earlier.length <= d.start),
	)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, {
			[input.objectKey]:
				input.mode === "update" ? ["create", "update"] : ["create"],
		});
		const canCreateCompanies =
			input.objectKey === "contact" &&
			(await hasPermission(context.workspaceId, { company: ["create"] }));
		return data.importCsv(
			context.workspaceId,
			context.session.user.id,
			input.objectKey,
			{ ...input, canCreateCompanies },
		);
	});
