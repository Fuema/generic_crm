import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Json } from "#/platform/json";

// Core Better Auth Schema Tables mapped to PostgreSQL
export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").unique().notNull(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	// two-factor plugin
	twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").unique().notNull(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	// organization plugin: the workspace this session is working in
	activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

// two-factor plugin: TOTP secret and hashed backup codes per user
export const twoFactor = pgTable(
	"two_factor",
	{
		id: text("id").primaryKey(),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		verified: boolean("verified").default(true),
		failedVerificationCount: integer("failed_verification_count").default(0),
		lockedUntil: timestamp("locked_until"),
	},
	(t) => [
		index("two_factor_secret_idx").on(t.secret),
		index("two_factor_user_id_idx").on(t.userId),
	],
);

// passkey plugin: WebAuthn credentials
export const passkey = pgTable(
	"passkey",
	{
		id: text("id").primaryKey(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports"),
		createdAt: timestamp("created_at"),
		aaguid: text("aaguid"),
	},
	(t) => [
		index("passkey_user_id_idx").on(t.userId),
		index("passkey_credential_id_idx").on(t.credentialID),
	],
);

// Rate-limit counters. Stored in Postgres because Cloudflare Workers don't
// share memory between instances, so in-memory limits would not hold.
export const rateLimit = pgTable("rate_limit", {
	id: text("id").primaryKey(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// organization plugin: workspaces
export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	createdAt: timestamp("created_at").notNull(),
	metadata: text("metadata"),
});

// organization plugin: who belongs to which workspace, and with which role
export const member = pgTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("viewer"),
		createdAt: timestamp("created_at").notNull(),
	},
	(t) => [
		index("member_organization_id_idx").on(t.organizationId),
		index("member_user_id_idx").on(t.userId),
	],
);

// organization plugin: pending email invitations
export const invitation = pgTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").notNull().default("pending"),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("invitation_organization_id_idx").on(t.organizationId),
		index("invitation_email_idx").on(t.email),
	],
);

// Example business resource: every project belongs to exactly one workspace
export const project = pgTable(
	"project",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		// planned | active | on_hold | completed | cancelled
		status: text("status").notNull().default("planned"),
		// All-day dates, stored at 12:00 UTC
		startDate: timestamp("start_date"),
		dueDate: timestamp("due_date"),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// Who it's for (optional); the deal it came from
		contactId: text("contact_id").references(() => contact.id),
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		dealId: text("deal_id").references(() => deal.id, { onDelete: "set null" }),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("project_workspace_id_idx").on(t.workspaceId),
		index("project_workspace_status_idx").on(t.workspaceId, t.status),
		index("project_workspace_contact_idx").on(t.workspaceId, t.contactId),
		index("project_workspace_deal_idx").on(t.workspaceId, t.dealId),
		// One active project per deal, whatever path creates or restores it
		uniqueIndex("project_workspace_deal_active_unique")
			.on(t.workspaceId, t.dealId)
			.where(sql`${t.dealId} is not null and ${t.archivedAt} is null`),
		index("project_custom_gin_idx").using("gin", t.custom),
	],
);

// ---------------------------------------------------------------------------
// Products, orders and invoices. Money is stored as integer cents and tax rates
// as basis points (825 = 8.25%), so totals never suffer floating-point drift.
// ---------------------------------------------------------------------------

// Per-workspace defaults for new orders and invoices
export const workspaceSetting = pgTable("workspace_setting", {
	workspaceId: text("workspace_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	// ISO 4217 code, e.g. "USD"
	currency: text("currency").notNull().default("USD"),
	defaultTaxRateBp: integer("default_tax_rate_bp").notNull().default(0),
	paymentTermsDays: integer("payment_terms_days").notNull().default(30),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Document number sequences. Incremented with a single atomic upsert, so two
// requests can never receive the same number. year = 0 for non-yearly series.
export const workspaceCounter = pgTable(
	"workspace_counter",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// "order" | "invoice"
		kind: text("kind").notNull(),
		year: integer("year").notNull().default(0),
		value: integer("value").notNull().default(0),
	},
	(t) => [
		uniqueIndex("workspace_counter_key").on(t.workspaceId, t.kind, t.year),
	],
);

export const product = pgTable(
	"product",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		sku: text("sku").notNull(),
		description: text("description"),
		unitPriceCents: integer("unit_price_cents").notNull(),
		// Kept equal to "not archived" for the old order code until orders are
		// re-ported (phase 2 step 5), then dropped
		active: boolean("active").notNull().default(true),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		// Archived products stay on old documents but can't be added to new ones
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("product_workspace_sku_unique").on(
			t.workspaceId,
			sql`lower(${t.sku})`,
		),
		index("product_workspace_name_idx").on(t.workspaceId, t.name),
	],
);

// "order" is a reserved word in SQL, hence sales_order. An order is for a
// contact (company, deal and the quote it came from are optional). Lines copy
// the product's name, SKU and price. Only drafts change (spec §10).
export const salesOrder = pgTable(
	"sales_order",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Shown as ORD-0001
		number: integer("number").notNull(),
		contactId: text("contact_id")
			.notNull()
			.references(() => contact.id),
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		dealId: text("deal_id").references(() => deal.id, { onDelete: "set null" }),
		// The accepted quote it was created from; one order per quote
		quoteId: text("quote_id").references(() => quote.id, {
			onDelete: "set null",
		}),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// draft | confirmed | fulfilled | cancelled
		status: text("status").notNull().default("draft"),
		// The language its documents are written in (en | es)
		locale: text("locale").notNull().default("en"),
		orderDate: timestamp("order_date").notNull().defaultNow(),
		currency: text("currency").notNull(),
		taxRateBp: integer("tax_rate_bp").notNull().default(0),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		taxCents: integer("tax_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull().default(0),
		notes: text("notes"),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("sales_order_workspace_number_unique").on(
			t.workspaceId,
			t.number,
		),
		uniqueIndex("sales_order_workspace_quote_unique")
			.on(t.workspaceId, t.quoteId)
			.where(sql`${t.quoteId} is not null`),
		index("sales_order_workspace_status_idx").on(t.workspaceId, t.status),
		index("sales_order_workspace_contact_idx").on(t.workspaceId, t.contactId),
		index("sales_order_workspace_deal_idx").on(t.workspaceId, t.dealId),
		index("sales_order_custom_gin_idx").using("gin", t.custom),
	],
);

export const orderLine = pgTable(
	"order_line",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		orderId: text("order_id")
			.notNull()
			.references(() => salesOrder.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		productId: text("product_id").references(() => product.id, {
			onDelete: "set null",
		}),
		// Snapshot of the product at the time it was added
		description: text("description").notNull(),
		sku: text("sku"),
		quantity: integer("quantity").notNull(),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
	},
	(t) => [
		index("order_line_order_idx").on(t.workspaceId, t.orderId, t.position),
	],
);

// An invoice for a contact: from an order (one invoice per order that isn't
// void) or direct. Numbered INV-2026-0001 when issued, so drafts leave no gaps;
// an issued invoice never changes, it can only be voided. Payments: step 6.
export const invoice = pgTable(
	"invoice",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// No action (see payment.invoice_id): an order with invoices can't be deleted
		orderId: text("order_id").references(() => salesOrder.id),
		contactId: text("contact_id")
			.notNull()
			.references(() => contact.id),
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		dealId: text("deal_id").references(() => deal.id, { onDelete: "set null" }),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		year: integer("year"),
		number: integer("number"),
		// draft | issued | partially_paid | paid | void
		status: text("status").notNull().default("draft"),
		locale: text("locale").notNull().default("en"),
		issueDate: timestamp("issue_date"),
		dueDate: timestamp("due_date"),
		sentAt: timestamp("sent_at"),
		paidAt: timestamp("paid_at"),
		voidedAt: timestamp("voided_at"),
		currency: text("currency").notNull(),
		taxRateBp: integer("tax_rate_bp").notNull(),
		subtotalCents: integer("subtotal_cents").notNull(),
		taxCents: integer("tax_cents").notNull(),
		totalCents: integer("total_cents").notNull(),
		// Sum of confirmed payments, kept in the same batch as each payment change
		paidCents: integer("paid_cents").notNull().default(0),
		notes: text("notes"),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("invoice_workspace_number_unique").on(
			t.workspaceId,
			t.year,
			t.number,
		),
		// One invoice per order; a voided one frees the order
		uniqueIndex("invoice_workspace_order_unique")
			.on(t.workspaceId, t.orderId)
			.where(sql`${t.orderId} is not null and ${t.status} <> 'void'`),
		index("invoice_workspace_status_idx").on(t.workspaceId, t.status),
		index("invoice_workspace_contact_idx").on(t.workspaceId, t.contactId),
		// The deal page's invoices and the deal timeline look invoices up by deal
		index("invoice_workspace_deal_idx").on(t.workspaceId, t.dealId),
		index("invoice_custom_gin_idx").using("gin", t.custom),
	],
);

export const invoiceLine = pgTable(
	"invoice_line",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		invoiceId: text("invoice_id")
			.notNull()
			.references(() => invoice.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		productId: text("product_id").references(() => product.id, {
			onDelete: "set null",
		}),
		description: text("description").notNull(),
		sku: text("sku"),
		quantity: integer("quantity").notNull(),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
	},
	(t) => [
		index("invoice_line_invoice_idx").on(
			t.workspaceId,
			t.invoiceId,
			t.position,
		),
	],
);

// A payment against an issued invoice (spec §6.2). Recorded by staff (an
// owner's or admin's is confirmed at once, an editor's waits as reported) or,
// from phase 4, reported by the customer in the portal. Only confirmed
// payments count towards the invoice's balance. Receipts: phase 3 (files).
export const payment = pgTable(
	"payment",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// No action, not restrict: still blocks deleting an invoice with payments,
		// but is checked after a workspace's cascade has removed both
		invoiceId: text("invoice_id")
			.notNull()
			.references(() => invoice.id),
		amountCents: integer("amount_cents").notNull(),
		// All-day date the money was paid, stored at 12:00 UTC
		paidOn: timestamp("paid_on").notNull(),
		// bank_transfer | cash | card | other
		method: text("method").notNull(),
		reference: text("reference"),
		note: text("note"),
		// reported | confirmed | rejected
		status: text("status").notNull().default("reported"),
		// staff | portal
		source: text("source").notNull().default("staff"),
		recordedById: text("recorded_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		decidedById: text("decided_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		decidedAt: timestamp("decided_at"),
		rejectReason: text("reject_reason"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("payment_invoice_idx").on(t.workspaceId, t.invoiceId, t.paidOn),
		index("payment_workspace_status_idx").on(t.workspaceId, t.status),
	],
);

// ---------------------------------------------------------------------------
// Tasks (board + calendar) and CRM activities (calendar)
// ---------------------------------------------------------------------------

export const task = pgTable(
	"task",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		// backlog | todo | in_progress | review | done
		status: text("status").notNull().default("todo"),
		// Order within a column. Fractional, so moving a card between two others
		// only rewrites that one card.
		position: doublePrecision("position").notNull(),
		// low | medium | high | urgent
		priority: text("priority").notNull().default("medium"),
		assigneeId: text("assignee_id").references(() => user.id, {
			onDelete: "set null",
		}),
		dueAt: timestamp("due_at"),
		// All-day tasks have a date but no meaningful time
		allDay: boolean("all_day").notNull().default(true),
		// The one record it's about (contact | company | deal | quote | order |
		// invoice), checked against the workspace on write; plus an optional
		// project for project work
		subjectType: text("subject_type"),
		subjectId: text("subject_id"),
		projectId: text("project_id").references(() => project.id, {
			onDelete: "set null",
		}),
		// A project milestone: shown on the project's timeline and page
		isMilestone: boolean("is_milestone").notNull().default(false),
		completedAt: timestamp("completed_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("task_workspace_status_position_idx").on(
			t.workspaceId,
			t.status,
			t.position,
		),
		index("task_workspace_due_idx").on(t.workspaceId, t.dueAt),
		index("task_workspace_assignee_idx").on(t.workspaceId, t.assigneeId),
		index("task_workspace_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
		),
		index("task_workspace_project_idx").on(t.workspaceId, t.projectId),
	],
);

export const activity = pgTable(
	"activity",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// call | meeting | email | follow_up
		type: text("type").notNull(),
		subject: text("subject").notNull(),
		notes: text("notes"),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at"),
		allDay: boolean("all_day").notNull().default(false),
		completed: boolean("completed").notNull().default(false),
		// Who holds the call/meeting
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// The one record it's about (contact | company | deal | quote | order |
		// invoice), checked against the workspace on write; plus an optional
		// project for project work
		subjectType: text("subject_type"),
		subjectId: text("subject_id"),
		projectId: text("project_id").references(() => project.id, {
			onDelete: "set null",
		}),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("activity_workspace_starts_idx").on(t.workspaceId, t.startsAt),
		index("activity_workspace_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
		),
		index("activity_workspace_project_idx").on(t.workspaceId, t.projectId),
	],
);

// ---------------------------------------------------------------------------
// Generic CRM (spec §6, §11). Ids are UUID v7 (time-ordered). Every table has
// workspace_id with ON DELETE CASCADE; records are archived, not deleted.
// ---------------------------------------------------------------------------

// Append-only log of every change that matters, written in the same db.batch as
// the change itself so it never disagrees with the data (spec §11.1)
export const event = pgTable(
	"event",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// e.g. "contact.created", "contact.updated", "contact.archived"
		type: text("type").notNull(),
		// "contact" | "company" | … — what the event is about
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id").notNull(),
		// "member" | "contact" | "system" | "workflow"
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id"),
		// For updates: { changes: { field: { from, to } } }
		payload: jsonb("payload")
			.$type<Record<string, Json>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("event_workspace_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
			t.createdAt,
		),
		index("event_workspace_created_idx").on(t.workspaceId, t.createdAt),
	],
);

// An organization a contact may belong to (optional, spec §6.2)
export const company = pgTable(
	"company",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// e.g. "acme.com"; unique per workspace when set
		domain: text("domain"),
		phone: text("phone"),
		city: text("city"),
		// ISO 3166-1 alpha-2 code, e.g. "US"
		country: text("country"),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("company_workspace_domain_unique")
			.on(t.workspaceId, sql`lower(${t.domain})`)
			.where(sql`${t.domain} is not null`),
		index("company_workspace_name_idx").on(t.workspaceId, t.name),
	],
);

// A person: the central record of the CRM (spec §1, §6.2)
export const contact = pgTable(
	"contact",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		firstName: text("first_name").notNull(),
		lastName: text("last_name"),
		// Unique per workspace (case-insensitive) when set
		email: text("email"),
		phone: text("phone"),
		jobTitle: text("job_title"),
		// One primary company in v1
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		// subscriber | lead | qualified | customer | inactive
		lifecycleStage: text("lifecycle_stage").notNull().default("lead"),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// "en" | "es"; null = the workspace default
		locale: text("locale"),
		// unknown | granted | revoked
		emailConsent: text("email_consent").notNull().default("unknown"),
		emailConsentSource: text("email_consent_source"),
		emailConsentAt: timestamp("email_consent_at"),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("contact_workspace_email_unique")
			.on(t.workspaceId, sql`lower(${t.email})`)
			.where(sql`${t.email} is not null`),
		index("contact_workspace_created_idx").on(t.workspaceId, t.createdAt),
		index("contact_workspace_stage_idx").on(t.workspaceId, t.lifecycleStage),
		index("contact_workspace_company_idx").on(t.workspaceId, t.companyId),
		index("contact_custom_gin_idx").using("gin", t.custom),
	],
);

// Workspace labels that can be put on any record (spec §6.2)
export const tag = pgTable(
	"tag",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// One of the fixed palette keys in src/modules/records/schema.ts
		color: text("color").notNull().default("gray"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("tag_workspace_name_unique").on(
			t.workspaceId,
			sql`lower(${t.name})`,
		),
	],
);

// A tag on one record. subject_type + subject_id point to any taggable record.
export const recordTag = pgTable(
	"record_tag",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "cascade" }),
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id").notNull(),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.tagId, t.subjectType, t.subjectId] }),
		index("record_tag_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
		),
	],
);

// Free text on any record; shown on its timeline (spec §6.2, §11.2). Deleting a
// note removes it (it may hold personal data); the event log keeps only the fact.
export const note = pgTable(
	"note",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id").notNull(),
		body: text("body").notNull(),
		pinned: boolean("pinned").notNull().default(false),
		authorId: text("author_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("note_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
			t.createdAt,
		),
	],
);

// Custom fields engine (spec §7.1–7.2). One engine for built-in records and,
// later, custom objects. Labels are { en, es }; values live in the record's
// `custom` jsonb, keyed by the field's immutable `key`.

// Named, ordered sections on a record page ("Billing details")
export const fieldGroup = pgTable(
	"field_group",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// "contact" | "company" (custom object keys later)
		objectKey: text("object_key").notNull(),
		label: jsonb("label").$type<{ en: string; es: string }>().notNull(),
		position: integer("position").notNull().default(0),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("field_group_object_idx").on(t.workspaceId, t.objectKey, t.position),
	],
);

export const fieldDefinition = pgTable(
	"field_definition",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		objectKey: text("object_key").notNull(),
		// Immutable once created; the key of the value in `custom`
		key: text("key").notNull(),
		label: jsonb("label").$type<{ en: string; es: string }>().notNull(),
		help: jsonb("help").$type<{ en: string; es: string }>(),
		// text | long_text | number | money | percent | date | checkbox |
		// single_choice | multiple_choice | email | phone | url (fixed once created)
		type: text("type").notNull(),
		// For choice fields: [{ value, label: { en, es } }]; value never changes
		options: jsonb("options")
			.$type<{ value: string; label: { en: string; es: string } }[]>()
			.notNull()
			.default([]),
		required: boolean("required").notNull().default(false),
		// Text and email only: no two records of this type share a value
		unique: boolean("unique").notNull().default(false),
		groupId: text("group_id").references(() => fieldGroup.id, {
			onDelete: "set null",
		}),
		position: integer("position").notNull().default(0),
		// hidden | read_only | editable (customer portal, phase 4)
		portalVisibility: text("portal_visibility").notNull().default("hidden"),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("field_definition_key_unique").on(
			t.workspaceId,
			t.objectKey,
			t.key,
		),
		index("field_definition_object_idx").on(
			t.workspaceId,
			t.objectKey,
			t.position,
		),
	],
);

// Sales pipelines and their ordered stages (spec §6.2). Names are { en, es }.
// Stages are archived, never deleted, because deals point to them.
export const pipeline = pgTable(
	"pipeline",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Immutable; lets templates add a pipeline only once ("sales")
		key: text("key").notNull(),
		name: jsonb("name").$type<{ en: string; es: string }>().notNull(),
		position: integer("position").notNull().default(0),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("pipeline_workspace_key_unique").on(t.workspaceId, t.key),
	],
);

export const pipelineStage = pgTable(
	"pipeline_stage",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		pipelineId: text("pipeline_id")
			.notNull()
			.references(() => pipeline.id, { onDelete: "cascade" }),
		name: jsonb("name").$type<{ en: string; es: string }>().notNull(),
		position: integer("position").notNull().default(0),
		// Chance of winning, 0–100 (won = 100, lost = 0)
		probability: integer("probability").notNull().default(0),
		// open | won | lost; each pipeline has exactly one won and one lost stage
		type: text("type").notNull().default("open"),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("pipeline_stage_pipeline_idx").on(
			t.workspaceId,
			t.pipelineId,
			t.position,
		),
	],
);

// An opportunity in a pipeline (spec §6.2). Every deal has a contact; the
// company is optional. status mirrors the stage's type (open / won / lost) so
// lists can filter without a join; lost deals keep their reason.
export const deal = pgTable(
	"deal",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		pipelineId: text("pipeline_id")
			.notNull()
			.references(() => pipeline.id),
		stageId: text("stage_id")
			.notNull()
			.references(() => pipelineStage.id),
		// open | won | lost (the stage's type)
		status: text("status").notNull().default("open"),
		valueCents: integer("value_cents").notNull().default(0),
		// All-day date, stored at 12:00 UTC
		expectedCloseAt: timestamp("expected_close_at"),
		contactId: text("contact_id")
			.notNull()
			.references(() => contact.id),
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		lostReason: text("lost_reason"),
		closedAt: timestamp("closed_at"),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("deal_workspace_stage_idx").on(
			t.workspaceId,
			t.pipelineId,
			t.stageId,
		),
		index("deal_workspace_status_idx").on(t.workspaceId, t.status),
		index("deal_workspace_contact_idx").on(t.workspaceId, t.contactId),
		index("deal_workspace_company_idx").on(t.workspaceId, t.companyId),
		index("deal_workspace_created_idx").on(t.workspaceId, t.createdAt),
		index("deal_custom_gin_idx").using("gin", t.custom),
	],
);

// A quote to a contact (spec §6.2, §10). Numbered QUO-0001 per workspace when
// created. Lines copy the product's name, SKU and price, so catalog changes
// never alter a quote. Only drafts change; "expired" is a sent quote past its
// valid-until day, worked out when read.
export const quote = pgTable(
	"quote",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		number: integer("number").notNull(),
		// draft | sent | accepted | declined
		status: text("status").notNull().default("draft"),
		contactId: text("contact_id")
			.notNull()
			.references(() => contact.id),
		companyId: text("company_id").references(() => company.id, {
			onDelete: "set null",
		}),
		dealId: text("deal_id").references(() => deal.id, { onDelete: "set null" }),
		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// The language the quote is written in (en | es)
		locale: text("locale").notNull().default("en"),
		currency: text("currency").notNull(),
		taxRateBp: integer("tax_rate_bp").notNull().default(0),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		taxCents: integer("tax_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull().default(0),
		// All-day date, stored at 12:00 UTC
		validUntil: timestamp("valid_until"),
		notes: text("notes"),
		sentAt: timestamp("sent_at"),
		acceptedAt: timestamp("accepted_at"),
		declinedAt: timestamp("declined_at"),
		declineReason: text("decline_reason"),
		custom: jsonb("custom").$type<Record<string, Json>>().notNull().default({}),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("quote_workspace_number_unique").on(t.workspaceId, t.number),
		index("quote_workspace_status_idx").on(t.workspaceId, t.status),
		index("quote_workspace_contact_idx").on(t.workspaceId, t.contactId),
		index("quote_workspace_deal_idx").on(t.workspaceId, t.dealId),
		index("quote_custom_gin_idx").using("gin", t.custom),
	],
);

export const quoteLine = pgTable(
	"quote_line",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		quoteId: text("quote_id")
			.notNull()
			.references(() => quote.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		// The catalog product it was copied from, if any (free-text lines: null)
		productId: text("product_id").references(() => product.id, {
			onDelete: "set null",
		}),
		description: text("description").notNull(),
		sku: text("sku"),
		quantity: integer("quantity").notNull(),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
	},
	(t) => [
		index("quote_line_quote_idx").on(t.workspaceId, t.quoteId, t.position),
	],
);

// Personal display preferences, per user across workspaces and devices
export const userPreference = pgTable("user_preference", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	// Days side by side in the calendar's "days" view (1–14)
	calendarDays: integer("calendar_days").notNull().default(3),
	// Task board shows tasks due within this many days (plus overdue); null = all
	taskDueDays: integer("task_due_days"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A named combination of filters, columns and sort for a list (spec §7.3).
// Private to its creator, or shared with the workspace.
export const savedView = pgTable(
	"saved_view",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// "contact" | "company"
		objectKey: text("object_key").notNull(),
		name: text("name").notNull(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		shared: boolean("shared").notNull().default(false),
		// { filters, columns, sort } — validated against the field definitions
		config: jsonb("config").$type<Record<string, Json>>().notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("saved_view_object_idx").on(t.workspaceId, t.objectKey),
		index("saved_view_owner_idx").on(t.workspaceId, t.ownerId),
	],
);

// ---------------------------------------------------------------------------
// Files and folders (spec §9), phase 3 step 4. The bytes live in R2 (in dev,
// Miniflare's local R2 on disk) under storage_key; the database holds the
// name, type and size. A file sits either in the workspace tree (folder_id,
// null = top level) or on a record (subject_type + subject_id, no foreign
// key, checked on write); a payment receipt is a file on the invoice that also
// points to its payment.
// ---------------------------------------------------------------------------

export const folder = pgTable(
	"folder",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Null = top level; only empty folders can be deleted
		parentId: text("parent_id").references((): AnyPgColumn => folder.id),
		name: text("name").notNull(),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		// One name per level, ignoring case
		uniqueIndex("folder_workspace_parent_name_unique").on(
			t.workspaceId,
			sql`coalesce(${t.parentId}, '')`,
			sql`lower(${t.name})`,
		),
	],
);

export const file = pgTable(
	"file",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		folderId: text("folder_id").references(() => folder.id),
		subjectType: text("subject_type"),
		subjectId: text("subject_id"),
		paymentId: text("payment_id").references(() => payment.id),
		// The original name, shown and used for downloads
		name: text("name").notNull(),
		contentType: text("content_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		// workspace/<workspace id>/<uuid>
		storageKey: text("storage_key").notNull(),
		// For the customer portal (phase 4)
		sharedWithCustomer: boolean("shared_with_customer")
			.notNull()
			.default(false),
		uploadedById: text("uploaded_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("file_workspace_subject_idx").on(
			t.workspaceId,
			t.subjectType,
			t.subjectId,
		),
		index("file_workspace_folder_idx").on(t.workspaceId, t.folderId),
		index("file_workspace_payment_idx").on(t.workspaceId, t.paymentId),
	],
);
