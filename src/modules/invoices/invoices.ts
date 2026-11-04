import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./invoices.server";
import {
	createInvoiceSchema,
	invoiceIdSchema,
	invoiceSearchSchema,
	relatedInvoicesSchema,
	updateInvoiceSchema,
} from "./schema";

// Server functions for invoices. Each checks the caller's role and validates
// its input, then calls the data layer with the workspace from the session
// (context.workspaceId), never from input. Issuing, voiding and sending use the
// invoice permission's own actions (owners and admins), so editors draft.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listInvoices = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(invoiceSearchSchema)
	.handler(({ data: search, context }) =>
		data.listInvoices(context.workspaceId, search),
	);

export const getInvoice = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.getInvoiceDetail(context.workspaceId, id),
	);

export const createInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["create"] })])
	.validator(createInvoiceSchema)
	.handler(({ data: input, context }) =>
		data.createInvoice(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["update"] })])
	.validator(updateInvoiceSchema)
	.handler(({ data: input, context }) =>
		data.updateInvoice(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const issueInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["issue"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.issueInvoice(context.workspaceId, member(context.session.user.id), id),
	);

export const voidInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["void"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.voidInvoice(context.workspaceId, member(context.session.user.id), id),
	);

// Replies to the invoice email go to the member who sent it
export const sendInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["issue"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.sendInvoice(context.workspaceId, member(context.session.user.id), id, {
			name: context.session.user.name,
			email: context.session.user.email,
		}),
	);

export const archiveInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["delete"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setInvoiceArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["delete"] })])
	.validator(invoiceIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setInvoiceArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export const listRelatedInvoices = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(relatedInvoicesSchema)
	.handler(({ data: refs, context }) =>
		data.relatedInvoices(context.workspaceId, refs),
	);

export type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;
export type InvoiceRow = Awaited<
	ReturnType<typeof listInvoices>
>["rows"][number];
