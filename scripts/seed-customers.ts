// Seeds demo customers into one user's workspace, for testing search, filters
// and pagination. Every seeded row is tagged in `notes` so it can be removed.
//
//   bun run db:seed:customers --email you@example.com [--count 100] [--workspace "Name"]
//   bun run db:seed:customers --email you@example.com [--workspace "Name"] --clear
//
// --workspace picks one of the user's workspaces by name; without it, the
// workspace the user had open most recently is used.
import { faker } from "@faker-js/faker";
import { and, desc, eq, isNotNull, like } from "drizzle-orm";
import { db } from "../src/db/index";
import { customer, member, organization, session, user } from "../src/db/schema";
import { CUSTOMER_STATUSES } from "../src/lib/schema";

const DEMO_TAG = "[demo]";
// A spread of countries so the country filter has something to show
const COUNTRIES = ["US", "CA", "MX", "BR", "AR", "GB", "DE", "FR", "ES", "IT", "NL", "SE", "JP", "IN", "AU"];

function arg(name: string) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}

const email = arg("email")?.trim().toLowerCase();
const workspaceName = arg("workspace")?.trim();
const clear = process.argv.includes("--clear");
const total = Number(arg("count") ?? 100);

if (!email) {
	console.error("Usage: bun run db:seed:customers --email you@example.com [--count 100] [--clear]");
	process.exit(1);
}
if (!clear && (!Number.isInteger(total) || total < 1 || total > 1000)) {
	console.error("--count must be a whole number between 1 and 1000");
	process.exit(1);
}

const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (!owner) {
	console.error(`No user with email ${email}`);
	process.exit(1);
}

// A named workspace the user belongs to (only when --workspace is given)
const [named] = workspaceName
	? await db
			.select({ id: member.organizationId })
			.from(member)
			.innerJoin(organization, eq(organization.id, member.organizationId))
			.where(and(eq(member.userId, owner.id), eq(organization.name, workspaceName)))
			.limit(1)
	: [];
if (workspaceName && !named) {
	console.error(`${email} isn't a member of a workspace named "${workspaceName}"`);
	process.exit(1);
}

// Last-used workspace the user still belongs to, else their first membership
const [lastUsed] = await db
	.select({ id: member.organizationId })
	.from(session)
	.innerJoin(member, and(eq(member.organizationId, session.activeOrganizationId), eq(member.userId, owner.id)))
	.where(and(eq(session.userId, owner.id), isNotNull(session.activeOrganizationId)))
	.orderBy(desc(session.updatedAt))
	.limit(1);
const [first] = named
	? [named]
	: lastUsed
		? [lastUsed]
	: await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, owner.id)).limit(1);
if (!first) {
	console.error(`${email} doesn't belong to any workspace yet. Sign in once first.`);
	process.exit(1);
}
const [workspace] = await db
	.select({ id: organization.id, name: organization.name })
	.from(organization)
	.where(eq(organization.id, first.id));

if (clear) {
	const removed = await db
		.delete(customer)
		.where(and(eq(customer.workspaceId, workspace.id), like(customer.notes, `${DEMO_TAG}%`)))
		.returning({ id: customer.id });
	console.log(`Removed ${removed.length} demo customers from "${workspace.name}".`);
	process.exit(0);
}

// Same data on every run for a workspace, different data per workspace
faker.seed([...workspace.id].reduce((sum, c) => sum + c.charCodeAt(0), 0));
const rows = Array.from({ length: total }, (_, i) => {
	const firstName = faker.person.firstName();
	const lastName = faker.person.lastName();
	const createdAt = faker.date.past({ years: 1 });
	return {
		id: crypto.randomUUID(),
		workspaceId: workspace.id,
		name: `${firstName} ${lastName}`,
		// The index keeps every address unique within the workspace
		email: `${firstName}.${lastName}.${i + 1}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
		phone: faker.helpers.maybe(() => faker.phone.number({ style: "international" }), { probability: 0.8 }) ?? null,
		company: faker.helpers.maybe(() => faker.company.name(), { probability: 0.85 }) ?? null,
		status: faker.helpers.weightedArrayElement([
			{ weight: 3, value: CUSTOMER_STATUSES[0] },
			{ weight: 5, value: CUSTOMER_STATUSES[1] },
			{ weight: 2, value: CUSTOMER_STATUSES[2] },
		]),
		city: faker.location.city(),
		country: faker.helpers.arrayElement(COUNTRIES),
		notes: `${DEMO_TAG} ${faker.lorem.sentence()}`,
		createdById: null,
		createdAt,
		updatedAt: createdAt,
	};
});

// Skip emails that already exist, so the script can be run twice safely
const inserted = await db
	.insert(customer)
	.values(rows)
	.onConflictDoNothing()
	.returning({ id: customer.id });
console.log(`Added ${inserted.length} demo customers to "${workspace.name}" (${rows.length - inserted.length} already existed).`);
