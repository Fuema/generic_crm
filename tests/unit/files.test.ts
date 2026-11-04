import { expect, test } from "bun:test";
import {
	contentTypeFor,
	FILE_LIMITS,
	fileNameSchema,
	fileRights,
	folderNameSchema,
	formatBytes,
	uploadTargetSchema,
} from "#/modules/files/schema";

const id = "0195f0e2-7c1a-7000-8000-000000000001";

test("the stored type comes from the extension; scripts never pass", () => {
	expect(contentTypeFor("Contract.PDF")).toBe("application/pdf");
	expect(contentTypeFor("photo.jpeg")).toBe("image/jpeg");
	for (const name of [
		"page.html",
		"logo.svg",
		"run.exe",
		"noextension",
		".pdf",
	])
		expect(contentTypeFor(name)).toBeNull();
});

test("names have no slashes or control characters", () => {
	expect(fileNameSchema.safeParse("Invoice 2026.pdf").success).toBe(true);
	for (const name of ["", "  ", "a/b.pdf", "a\\b.pdf", "a\u0000.pdf"])
		expect(fileNameSchema.safeParse(name).success).toBe(false);
	expect(folderNameSchema.safeParse("x".repeat(81)).success).toBe(false);
	// A right-to-left mark could show "scanpiz.jpg" for a zip
	expect(
		fileNameSchema.safeParse(`scan${String.fromCharCode(0x202e)}gpj.zip`)
			.success,
	).toBe(false);
	expect(fileNameSchema.safeParse("Año 2026 – résumé.pdf").success).toBe(true);
});

test("an upload goes to a record or a folder, nothing else", () => {
	expect(
		uploadTargetSchema.safeParse({
			kind: "record",
			subjectType: "contact",
			subjectId: id,
			paymentId: "",
		}).success,
	).toBe(true);
	expect(
		uploadTargetSchema.safeParse({ kind: "folder", folderId: "" }).success,
	).toBe(true);
	expect(
		uploadTargetSchema.safeParse({
			kind: "record",
			subjectType: "customer",
			subjectId: id,
			paymentId: "",
		}).success,
	).toBe(false);
});

test("rights follow the record; workspace folders use the file resource", () => {
	expect(fileRights({ subjectType: "deal" }, "read")).toEqual({
		deal: ["read"],
	});
	expect(fileRights({ subjectType: "order" }, "delete")).toEqual({
		order: ["delete"],
	});
	expect(fileRights({ subjectType: null }, "update")).toEqual({
		file: ["update"],
	});
	expect(() => fileRights({ subjectType: "customer" }, "read")).toThrow();
});

test("limits and sizes", () => {
	expect(FILE_LIMITS.maxFileBytes).toBe(25 * 1024 * 1024);
	expect(FILE_LIMITS.workspaceQuotaBytes).toBe(1024 ** 3);
	expect(formatBytes(512, "en")).toBe("512 B");
	expect(formatBytes(1536, "en")).toBe("1.5 KB");
	expect(formatBytes(25 * 1024 * 1024, "en")).toBe("25 MB");
});
