import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, file, organization } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as files from "#/modules/files/files.server";
import { FILE_LIMITS } from "#/modules/files/schema";
import * as invoices from "#/modules/invoices/invoices.server";
import * as payments from "#/modules/payments/payments.server";
import * as records from "#/modules/records/records.server";
import { fileBucket } from "#/platform/storage.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Files and folders (phase 3 step 4): uploads to records and folders, types,
// sizes and the quota, receipts, deleting for good, the folder tree, the
// timeline and isolation. The bytes go to the in-memory store (NODE_ENV=test).
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const person = (firstName: string): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "en",
	emailConsent: "unknown",
});

// An upload body as the route passes it: a stream and its declared size
const content = (text: string, size?: number) => {
	const encoded = new TextEncoder().encode(text);
	return {
		size: size ?? encoded.byteLength,
		body: new Blob([encoded]).stream(),
	};
};
const onRecord = (subjectType: "contact" | "invoice", subjectId: string) => ({
	kind: "record" as const,
	subjectType,
	subjectId,
	paymentId: "",
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

async function readAll(stream: ReadableStream) {
	return new Response(stream).text();
}

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("fla"), createWorkspace("flb")]);
	contactA = (
		await contacts.createContact(a.workspaceId, actorA(), person("Ana"))
	).id;
});
afterAll(cleanup);

describe("files", () => {
	test("a file on a contact: stored, listed, on the timeline, deleted for good", async () => {
		const { id } = await files.uploadFile(
			a.workspaceId,
			actorA(),
			onRecord("contact", contactA),
			{ name: "brief.pdf", ...content("%PDF-1.4 brief") },
		);
		const listed = await files.recordFiles(a.workspaceId, "contact", contactA);
		expect(
			listed.map((f) => [f.id, f.name, f.contentType, f.sizeBytes]),
		).toEqual([[id, "brief.pdf", "application/pdf", 14]]);
		const row = await files.findFile(a.workspaceId, id);
		const object = await files.openFile(row);
		expect(object && (await readAll(object.body))).toBe("%PDF-1.4 brief");
		await files.setFileShared(a.workspaceId, actorA(), row, true);

		const timeline = await records.getTimeline(
			a.workspaceId,
			"contact",
			contactA,
		);
		expect(timeline.events.map((e) => e.type)).toEqual(
			expect.arrayContaining(["contact.file_added", "contact.file_shared"]),
		);

		await files.deleteFile(
			a.workspaceId,
			actorA(),
			await files.findFile(a.workspaceId, id),
		);
		expect(await status(files.findFile(a.workspaceId, id))).toBe(404);
		expect(await files.openFile(row)).toBeNull();
		const [deleted] = await db
			.select({ type: event.type })
			.from(event)
			.where(
				and(
					eq(event.subjectId, contactA),
					eq(event.type, "contact.file_deleted"),
				),
			);
		expect(deleted).toBeTruthy();
	});

	test("type, size and the workspace quota are enforced", async () => {
		const target = onRecord("contact", contactA);
		expect(
			await status(
				files.uploadFile(a.workspaceId, actorA(), target, {
					name: "page.html",
					...content("<script>"),
				}),
			),
		).toBe(415);
		expect(
			await status(
				files.uploadFile(a.workspaceId, actorA(), target, {
					name: "big.pdf",
					size: FILE_LIMITS.maxFileBytes + 1,
					body: new Blob([]).stream(),
				}),
			),
		).toBe(413);
		// Fill workspace B's quota with a row, then any upload is refused
		await db.insert(file).values({
			id: crypto.randomUUID(),
			workspaceId: b.workspaceId,
			name: "filler.zip",
			contentType: "application/zip",
			sizeBytes: FILE_LIMITS.workspaceQuotaBytes,
			storageKey: "test/filler",
		});
		expect(
			await status(
				files.uploadFile(
					b.workspaceId,
					actorB(),
					{ kind: "folder", folderId: "" },
					{ name: "one.txt", ...content("1") },
				),
			),
		).toBe(413);
	});

	test("a receipt belongs to a payment of that invoice", async () => {
		const inv = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		await invoices.updateInvoice(a.workspaceId, actorA(), {
			id: inv.id,
			contactId: contactA,
			companyId: "",
			ownerId: "",
			locale: "en",
			taxRateBp: 0,
			notes: "",
			lines: [
				{
					productId: "",
					description: "Work",
					sku: "",
					quantity: 1,
					unitPriceCents: 1000,
				},
			],
		});
		await invoices.issueInvoice(a.workspaceId, actorA(), inv.id);
		const pay = await payments.recordPayment(
			a.workspaceId,
			actorA(),
			{
				invoiceId: inv.id,
				amountCents: 500,
				paidOn: new Date().toISOString().slice(0, 10),
				method: "cash",
				reference: "",
				note: "",
			},
			true,
		);
		await files.uploadFile(
			a.workspaceId,
			actorA(),
			{ ...onRecord("invoice", inv.id), paymentId: pay.id },
			{ name: "receipt.png", ...content("png") },
		);
		const listed = await files.recordFiles(a.workspaceId, "invoice", inv.id);
		expect(listed.map((f) => f.paymentId)).toEqual([pay.id]);
		// The payment's id with another record is refused
		expect(
			await status(
				files.uploadFile(
					a.workspaceId,
					actorA(),
					{ ...onRecord("contact", contactA), paymentId: pay.id },
					{ name: "receipt.png", ...content("png") },
				),
			),
		).toBe(400);
	});

	test("folders nest up to 5 levels, never into themselves, delete only when empty", async () => {
		const top = await files.createFolder(a.workspaceId, actorA(), {
			name: "Contracts",
			parentId: "",
		});
		expect(
			await status(
				files.createFolder(a.workspaceId, actorA(), {
					name: "contracts",
					parentId: "",
				}),
			),
		).toBe(409);
		let parent = top.id;
		const chain = [top.id];
		for (const name of ["2", "3", "4", "5"]) {
			parent = (
				await files.createFolder(a.workspaceId, actorA(), {
					name,
					parentId: parent,
				})
			).id;
			chain.push(parent);
		}
		expect(
			await status(
				files.createFolder(a.workspaceId, actorA(), {
					name: "6",
					parentId: parent,
				}),
			),
		).toBe(409);
		// Not into its own subfolder
		expect(
			await status(
				files.moveFolder(a.workspaceId, actorA(), {
					id: top.id,
					parentId: chain[2],
				}),
			),
		).toBe(409);
		// A file inside blocks deleting the folder
		const inside = await files.uploadFile(
			a.workspaceId,
			actorA(),
			{ kind: "folder", folderId: chain[4] },
			{ name: "notes.txt", ...content("hi") },
		);
		expect(
			await status(files.deleteFolder(a.workspaceId, actorA(), chain[4])),
		).toBe(409);
		const listing = await files.listFolder(a.workspaceId, chain[4]);
		expect(listing.path.map((p) => p.name)).toEqual([
			"Contracts",
			"2",
			"3",
			"4",
			"5",
		]);
		expect(listing.files.map((f) => f.id)).toEqual([inside.id]);
		await files.deleteFile(
			a.workspaceId,
			actorA(),
			await files.findFile(a.workspaceId, inside.id),
		);
		await files.deleteFolder(a.workspaceId, actorA(), chain[4]);
		// Moving a 4-level subtree under a 2-level folder would exceed 5
		const side = await files.createFolder(a.workspaceId, actorA(), {
			name: "Side",
			parentId: "",
		});
		const sub = await files.createFolder(a.workspaceId, actorA(), {
			name: "Sub",
			parentId: side.id,
		});
		expect(
			await status(
				files.moveFolder(a.workspaceId, actorA(), {
					id: top.id,
					parentId: sub.id,
				}),
			),
		).toBe(409);
		await files.renameFolder(a.workspaceId, actorA(), {
			id: side.id,
			name: "Archive",
		});
		await files.moveFolder(a.workspaceId, actorA(), {
			id: side.id,
			parentId: top.id,
		});
		const root = await files.listFolder(a.workspaceId, null);
		expect(root.folders.map((f) => f.name)).toEqual(["Contracts"]);
	});

	test("the quota holds for two uploads at once; a short body is refused", async () => {
		const c = await createWorkspace("flc");
		const actorC = { type: "member" as const, id: c.userId };
		// Room for one 6-byte file, not two
		await db.insert(file).values({
			id: crypto.randomUUID(),
			workspaceId: c.workspaceId,
			name: "filler.zip",
			contentType: "application/zip",
			sizeBytes: FILE_LIMITS.workspaceQuotaBytes - 10,
			storageKey: "test/filler-c",
		});
		const folderTarget = { kind: "folder" as const, folderId: "" };
		const results = await Promise.all(
			["one.txt", "two.txt"].map((name) =>
				status(
					files.uploadFile(c.workspaceId, actorC, folderTarget, {
						name,
						...content("123456"),
					}),
				),
			),
		);
		expect(results.sort()).toEqual([200, 413]);
		// Declared 10 bytes, sent 3 (in a workspace with room)
		expect(
			await status(
				files.uploadFile(a.workspaceId, actorA(), folderTarget, {
					name: "short.txt",
					...content("abc", 10),
				}),
			),
		).toBe(400);
		// Deleting the workspace removes its stored files too
		const bucket = await fileBucket();
		const before = await bucket.list({ prefix: `workspace/${c.workspaceId}/` });
		expect(before.objects.length).toBe(1);
		await db.delete(organization).where(eq(organization.id, c.workspaceId));
		const { deleteWorkspaceObjects } = await import(
			"#/platform/storage.server"
		);
		await deleteWorkspaceObjects(c.workspaceId);
		const after = await bucket.list({ prefix: `workspace/${c.workspaceId}/` });
		expect(after.objects).toEqual([]);
	});

	test("sharing: only record files, only while the record is active; merge moves files", async () => {
		const shelf = await files.uploadFile(
			a.workspaceId,
			actorA(),
			{ kind: "folder", folderId: "" },
			{ name: "price list.pdf", ...content("%PDF") },
		);
		expect(
			await status(
				files.setFileShared(
					a.workspaceId,
					actorA(),
					await files.findFile(a.workspaceId, shelf.id),
					true,
				),
			),
		).toBe(400);
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Keep"),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Dup"),
		);
		const onDup = await files.uploadFile(
			a.workspaceId,
			actorA(),
			onRecord("contact", dup.id),
			{ name: "id.png", ...content("png") },
		);
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		const kept = await files.recordFiles(a.workspaceId, "contact", keep.id);
		expect(kept.map((f) => f.id)).toEqual([onDup.id]);
		// The duplicate is archived now: its record can't change, so neither can
		// a file still pointing to it
		const archived = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Old"),
		);
		const onOld = await files.uploadFile(
			a.workspaceId,
			actorA(),
			onRecord("contact", archived.id),
			{ name: "old.txt", ...content("x") },
		);
		await contacts.setContactArchived(
			a.workspaceId,
			actorA(),
			archived.id,
			true,
		);
		expect(
			await status(
				files.setFileShared(
					a.workspaceId,
					actorA(),
					await files.findFile(a.workspaceId, onOld.id),
					true,
				),
			),
		).toBe(409);
	});

	test("never reaches across workspaces", async () => {
		const { id } = await files.uploadFile(
			a.workspaceId,
			actorA(),
			onRecord("contact", contactA),
			{ name: "private.txt", ...content("secret") },
		);
		const folderA = await files.createFolder(a.workspaceId, actorA(), {
			name: "Private",
			parentId: "",
		});
		expect(await status(files.findFile(b.workspaceId, id))).toBe(404);
		expect(await files.recordFiles(b.workspaceId, "contact", contactA)).toEqual(
			[],
		);
		// B can't upload onto A's contact or into A's folder, nor use it
		for (const target of [
			onRecord("contact", contactA),
			{ kind: "folder" as const, folderId: folderA.id },
		]) {
			expect(
				await status(
					files.uploadFile(b.workspaceId, actorB(), target, {
						name: "x.txt",
						...content("x"),
					}),
				),
			).toBe(404);
		}
		// Started one at a time: a call rejected before it's awaited would be an
		// unhandled rejection that ends the test early
		for (const call of [
			() => files.listFolder(b.workspaceId, folderA.id),
			() =>
				files.renameFolder(b.workspaceId, actorB(), {
					id: folderA.id,
					name: "Mine",
				}),
			() => files.deleteFolder(b.workspaceId, actorB(), folderA.id),
			() =>
				files.createFolder(b.workspaceId, actorB(), {
					name: "Child",
					parentId: folderA.id,
				}),
		]) {
			expect(await status(call())).toBe(404);
		}
		const usageB = await files.storageUsed(b.workspaceId);
		expect(usageB).toBe(FILE_LIMITS.workspaceQuotaBytes);
	});
});
