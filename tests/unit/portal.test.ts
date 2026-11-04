import { expect, test } from "bun:test";
import {
	PORTAL_LIMITS,
	portalCookieName,
	portalProfileSchema,
	requestLinkSchema,
	signInSchema,
	slugSchema,
} from "#/modules/portal/schema";

test("portal slugs are lower-case words and dashes", () => {
	expect(slugSchema.parse(" Acme-Co ")).toBe("acme-co");
	for (const bad of ["", "-acme", "acme/../x", "a b", "x".repeat(64)])
		expect(slugSchema.safeParse(bad).success).toBe(false);
});

test("a sign-in token is 32 random bytes in base64url", () => {
	const token = "A".repeat(43);
	expect(signInSchema.safeParse({ slug: "acme", token }).success).toBe(true);
	for (const bad of [
		"A".repeat(42),
		`${"A".repeat(42)}=`,
		`${"A".repeat(42)}+`,
	])
		expect(signInSchema.safeParse({ slug: "acme", token: bad }).success).toBe(
			false,
		);
});

test("link requests need a valid email; limits match the owner decisions", () => {
	expect(
		requestLinkSchema.safeParse({ slug: "acme", email: "not-an-email" })
			.success,
	).toBe(false);
	expect(PORTAL_LIMITS.tokenMinutes).toBe(15);
	expect(PORTAL_LIMITS.sessionDays).toBe(30);
});

test("each workspace's portal has its own session cookie", () => {
	expect(portalCookieName("acme")).not.toBe(portalCookieName("globex"));
	expect(portalCookieName("acme")).not.toContain("better-auth");
});

test("the portal profile never carries the email or staff-only fields", () => {
	const parsed = portalProfileSchema.parse({
		firstName: "Ana",
		lastName: "",
		phone: "",
		jobTitle: "",
		locale: "es",
		marketing: true,
		custom: {},
		email: "attacker@example.com",
		lifecycleStage: "customer",
		ownerId: "someone",
	});
	expect(Object.keys(parsed).sort()).toEqual([
		"custom",
		"firstName",
		"jobTitle",
		"lastName",
		"locale",
		"marketing",
		"phone",
	]);
	expect(
		portalProfileSchema.safeParse({ ...parsed, firstName: " " }).success,
	).toBe(false);
	expect(
		portalProfileSchema.safeParse({ ...parsed, phone: "12" }).success,
	).toBe(false);
});
