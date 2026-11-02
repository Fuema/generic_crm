import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
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
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("project_workspace_id_idx").on(t.workspaceId)],
);

// Customers. The workspace is a Better Auth organization: every query filters by
// workspace_id from the caller's active session, never from client input.
export const customer = pgTable(
	"customer",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		email: text("email").notNull(),
		phone: text("phone"),
		company: text("company"),
		// lead | active | inactive
		status: text("status").notNull().default("lead"),
		city: text("city"),
		// ISO 3166-1 alpha-2 code, e.g. "US"
		country: text("country"),
		notes: text("notes"),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		// One customer per email address within a workspace, case-insensitive
		uniqueIndex("customer_workspace_email_unique").on(
			t.workspaceId,
			sql`lower(${t.email})`,
		),
		index("customer_workspace_created_idx").on(t.workspaceId, t.createdAt),
		index("customer_workspace_status_idx").on(t.workspaceId, t.status),
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
		// Inactive products stay on old orders but can't be added to new ones
		active: boolean("active").notNull().default(true),
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

// "order" is a reserved word in SQL, hence sales_order
export const salesOrder = pgTable(
	"sales_order",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Shown as ORD-0001
		number: integer("number").notNull(),
		// A customer with orders can't be deleted
		customerId: text("customer_id")
			.notNull()
			.references(() => customer.id, { onDelete: "restrict" }),
		// draft | confirmed | fulfilled | cancelled
		status: text("status").notNull().default("draft"),
		orderDate: timestamp("order_date").notNull().defaultNow(),
		currency: text("currency").notNull(),
		taxRateBp: integer("tax_rate_bp").notNull().default(0),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		taxCents: integer("tax_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull().default(0),
		notes: text("notes"),
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
		index("sales_order_workspace_status_idx").on(t.workspaceId, t.status),
		index("sales_order_customer_idx").on(t.customerId),
	],
);

export const orderLine = pgTable(
	"order_line",
	{
		id: text("id").primaryKey(),
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
	(t) => [index("order_line_order_idx").on(t.orderId)],
);

export const invoice = pgTable(
	"invoice",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// One invoice per order; an order with an invoice can't be deleted
		orderId: text("order_id")
			.notNull()
			.unique()
			.references(() => salesOrder.id, { onDelete: "restrict" }),
		customerId: text("customer_id")
			.notNull()
			.references(() => customer.id, { onDelete: "restrict" }),
		// Shown as INV-2026-0001; numbered when issued, so drafts leave no gaps
		year: integer("year"),
		number: integer("number"),
		// draft | issued | paid | void
		status: text("status").notNull().default("draft"),
		issueDate: timestamp("issue_date"),
		dueDate: timestamp("due_date"),
		paidAt: timestamp("paid_at"),
		voidedAt: timestamp("voided_at"),
		currency: text("currency").notNull(),
		taxRateBp: integer("tax_rate_bp").notNull(),
		subtotalCents: integer("subtotal_cents").notNull(),
		taxCents: integer("tax_cents").notNull(),
		totalCents: integer("total_cents").notNull(),
		notes: text("notes"),
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
		index("invoice_workspace_status_idx").on(t.workspaceId, t.status),
	],
);

export const invoiceLine = pgTable(
	"invoice_line",
	{
		id: text("id").primaryKey(),
		invoiceId: text("invoice_id")
			.notNull()
			.references(() => invoice.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		description: text("description").notNull(),
		sku: text("sku"),
		quantity: integer("quantity").notNull(),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
	},
	(t) => [index("invoice_line_invoice_idx").on(t.invoiceId)],
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
		customerId: text("customer_id").references(() => customer.id, {
			onDelete: "set null",
		}),
		orderId: text("order_id").references(() => salesOrder.id, {
			onDelete: "set null",
		}),
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
		customerId: text("customer_id").references(() => customer.id, {
			onDelete: "set null",
		}),
		orderId: text("order_id").references(() => salesOrder.id, {
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
		index("activity_workspace_customer_idx").on(t.workspaceId, t.customerId),
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
