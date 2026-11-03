import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./quotes.server";
import {
	createQuoteSchema,
	declineQuoteSchema,
	quoteIdSchema,
	quoteSearchSchema,
	relatedQuotesSchema,
	sendQuoteSchema,
	updateQuoteSchema,
} from "./schema";

// Server functions for quotes. Each checks the caller's role and validates its
// input, then calls the data layer with the workspace from the session
// (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listQuotes = createServerFn({ method: "GET" })
	.middleware([requirePermission({ quote: ["read"] })])
	.validator(quoteSearchSchema)
	.handler(({ data: search, context }) =>
		data.listQuotes(context.workspaceId, search),
	);

export const getQuote = createServerFn({ method: "GET" })
	.middleware([requirePermission({ quote: ["read"] })])
	.validator(quoteIdSchema)
	.handler(({ data: { id }, context }) =>
		data.getQuoteDetail(context.workspaceId, id),
	);

export const createQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["create"] })])
	.validator(createQuoteSchema)
	.handler(({ data: input, context }) =>
		data.createQuote(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["update"] })])
	.validator(updateQuoteSchema)
	.handler(({ data: input, context }) =>
		data.updateQuote(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

// Replies to the quote email go to the member who sent it
export const sendQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["update"] })])
	.validator(sendQuoteSchema)
	.handler(({ data: input, context }) =>
		data.sendQuote(
			context.workspaceId,
			member(context.session.user.id),
			input,
			{
				name: context.session.user.name,
				email: context.session.user.email,
			},
		),
	);

export const reopenQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["update"] })])
	.validator(quoteIdSchema)
	.handler(({ data: { id }, context }) =>
		data.reopenQuote(context.workspaceId, member(context.session.user.id), id),
	);

export const acceptQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["update"] })])
	.validator(quoteIdSchema)
	.handler(({ data: { id }, context }) =>
		data.acceptQuote(context.workspaceId, member(context.session.user.id), id),
	);

export const declineQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["update"] })])
	.validator(declineQuoteSchema)
	.handler(({ data: input, context }) =>
		data.declineQuote(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const archiveQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["delete"] })])
	.validator(quoteIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setQuoteArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreQuote = createServerFn({ method: "POST" })
	.middleware([requirePermission({ quote: ["delete"] })])
	.validator(quoteIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setQuoteArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export const listRelatedQuotes = createServerFn({ method: "GET" })
	.middleware([requirePermission({ quote: ["read"] })])
	.validator(relatedQuotesSchema)
	.handler(({ data: refs, context }) =>
		data.relatedQuotes(context.workspaceId, refs),
	);

export type QuoteDetail = Awaited<ReturnType<typeof getQuote>>;
export type QuoteRow = Awaited<ReturnType<typeof listQuotes>>["rows"][number];
