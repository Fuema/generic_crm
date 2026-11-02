import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./contacts.server";
import {
	companyInputSchema,
	companySearchSchema,
	contactInputSchema,
	contactSearchSchema,
	idSchema,
} from "./schema";

// Server functions for contacts and companies. Each one checks the caller's role
// and validates its input, then calls the data layer with the workspace from the
// session (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listContacts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ contact: ["read"] })])
	.validator(contactSearchSchema)
	.handler(({ data: search, context }) =>
		data.listContacts(context.workspaceId, search),
	);

export const getContact = createServerFn({ method: "GET" })
	.middleware([requirePermission({ contact: ["read"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.getContactDetail(context.workspaceId, id),
	);

export const getContactFormOptions = createServerFn({ method: "GET" })
	.middleware([requirePermission({ contact: ["read"] })])
	.handler(({ context }) => data.getContactFormOptions(context.workspaceId));

export const createContact = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["create"] })])
	.validator(contactInputSchema)
	.handler(({ data: input, context }) =>
		data.createContact(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateContact = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["update"] })])
	.validator(contactInputSchema.extend(idSchema.shape))
	.handler(({ data: { id, ...input }, context }) =>
		data.updateContact(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const archiveContact = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["delete"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.setContactArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreContact = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["delete"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.setContactArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export const listCompanies = createServerFn({ method: "GET" })
	.middleware([requirePermission({ company: ["read"] })])
	.validator(companySearchSchema)
	.handler(({ data: search, context }) =>
		data.listCompanies(context.workspaceId, search),
	);

export const getCompany = createServerFn({ method: "GET" })
	.middleware([requirePermission({ company: ["read"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.getCompanyDetail(context.workspaceId, id),
	);

export const createCompany = createServerFn({ method: "POST" })
	.middleware([requirePermission({ company: ["create"] })])
	.validator(companyInputSchema)
	.handler(({ data: input, context }) =>
		data.createCompany(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateCompany = createServerFn({ method: "POST" })
	.middleware([requirePermission({ company: ["update"] })])
	.validator(companyInputSchema.extend(idSchema.shape))
	.handler(({ data: { id, ...input }, context }) =>
		data.updateCompany(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const archiveCompany = createServerFn({ method: "POST" })
	.middleware([requirePermission({ company: ["delete"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.setCompanyArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreCompany = createServerFn({ method: "POST" })
	.middleware([requirePermission({ company: ["delete"] })])
	.validator(idSchema)
	.handler(({ data: { id }, context }) =>
		data.setCompanyArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export type ContactListRow = Awaited<
	ReturnType<typeof listContacts>
>["rows"][number];
export type CompanyListRow = Awaited<
	ReturnType<typeof listCompanies>
>["rows"][number];
export type ContactDetail = Awaited<ReturnType<typeof getContact>>;
export type CompanyDetail = Awaited<ReturnType<typeof getCompany>>;
