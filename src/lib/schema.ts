import { z } from "zod";
import { m } from "#/paraglide/messages.js";

// Shared by the forms (client) and the Better Auth hooks (server), so both
// sides enforce exactly the same rules. Messages are functions (`{ error: () => … }`)
// so they resolve in the language of the request or page doing the check.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const passwordRules = [
	{
		id: "length",
		label: () => m.validation_password_rule_length({ min: PASSWORD_MIN }),
		test: (v: string) => v.length >= PASSWORD_MIN,
	},
	{
		id: "upper",
		label: m.validation_password_rule_upper,
		test: (v: string) => /[A-Z]/.test(v),
	},
	{
		id: "lower",
		label: m.validation_password_rule_lower,
		test: (v: string) => /[a-z]/.test(v),
	},
	{
		id: "number",
		label: m.validation_password_rule_number,
		test: (v: string) => /[0-9]/.test(v),
	},
	{
		id: "symbol",
		label: m.validation_password_rule_symbol,
		test: (v: string) => /[^A-Za-z0-9\s]/.test(v),
	},
] as const;

export const nameSchema = z
	.string()
	.trim()
	.min(2, { error: () => m.validation_name_min() })
	.max(50, { error: () => m.validation_name_max() })
	.regex(/^[\p{L}\p{M}][\p{L}\p{M} '.-]*$/u, {
		error: () => m.validation_name_chars(),
	});

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.max(254, { error: () => m.validation_email_max() })
	.pipe(z.email({ error: () => m.validation_email_invalid() }));

export const passwordSchema = z
	.string()
	.max(PASSWORD_MAX, {
		error: () => m.validation_password_max({ max: PASSWORD_MAX }),
	})
	.superRefine((value, ctx) => {
		for (const rule of passwordRules) {
			if (!rule.test(value)) {
				ctx.addIssue({
					code: "custom",
					message: m.validation_password_needs({
						rule: rule.label().toLowerCase(),
					}),
				});
			}
		}
		if (/^\s|\s$/.test(value)) {
			ctx.addIssue({
				code: "custom",
				message: m.validation_password_spaces(),
			});
		}
	});

// Rejects passwords that contain the user's name or the local part of their email
export function passwordContainsPersonalInfo(
	password: string,
	email: string,
	name?: string,
) {
	const lower = password.toLowerCase();
	const parts = [email.split("@")[0], ...(name ?? "").split(/\s+/)]
		.map((p) => p.toLowerCase())
		.filter((p) => p.length >= 3);
	return parts.some((p) => lower.includes(p));
}

export const signUpSchema = z
	.object({
		name: nameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: z.string(),
		acceptTerms: z
			.boolean()
			.refine((v) => v, { error: () => m.validation_terms_required() }),
	})
	.superRefine((data, ctx) => {
		if (data.password !== data.confirmPassword) {
			ctx.addIssue({
				code: "custom",
				path: ["confirmPassword"],
				message: m.validation_passwords_mismatch(),
			});
		}
		if (passwordContainsPersonalInfo(data.password, data.email, data.name)) {
			ctx.addIssue({
				code: "custom",
				path: ["password"],
				message: m.validation_password_personal(),
			});
		}
	});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
	email: emailSchema,
	// Only check presence here: the policy may have changed since the account was created
	password: z
		.string()
		.min(1, { error: () => m.validation_password_required() })
		.max(PASSWORD_MAX, { error: () => m.validation_password_too_long() }),
	rememberMe: z.boolean(),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
	.object({ password: passwordSchema, confirmPassword: z.string() })
	.refine((d) => d.password === d.confirmPassword, {
		path: ["confirmPassword"],
		error: () => m.validation_passwords_mismatch(),
	});

export const changePasswordSchema = z
	.object({
		currentPassword: z
			.string()
			.min(1, { error: () => m.validation_current_password_required() }),
		newPassword: passwordSchema,
		confirmPassword: z.string(),
		revokeOtherSessions: z.boolean(),
	})
	.superRefine((d, ctx) => {
		if (d.newPassword !== d.confirmPassword) {
			ctx.addIssue({
				code: "custom",
				path: ["confirmPassword"],
				message: m.validation_passwords_mismatch(),
			});
		}
		if (d.newPassword === d.currentPassword) {
			ctx.addIssue({
				code: "custom",
				path: ["newPassword"],
				message: m.validation_password_must_differ(),
			});
		}
	});

export const otpSchema = z
	.string()
	.regex(/^\d{6}$/, { error: () => m.validation_otp() });

// Better Auth backup codes are 10 characters, shown as XXXXX-XXXXX
export const backupCodeSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, {
		error: () => m.validation_backup_code(),
	});

export const workspaceNameSchema = z
	.string()
	.trim()
	.min(2, { error: () => m.validation_workspace_name_min() })
	.max(50, { error: () => m.validation_workspace_name_max() });

export const inviteSchema = z.object({
	email: emailSchema,
	role: z.enum(["admin", "editor", "viewer"], {
		error: () => m.validation_choose_role(),
	}),
});

export const PAGE_SIZES = [10, 25, 50, 100] as const;

// --- Billing settings (orders, invoices and products: src/modules) ----------

const percentString = z
	.string()
	.trim()
	.regex(/^\d{1,3}(\.\d{1,2})?$/, {
		error: () => m.validation_tax_rate_format(),
	})
	.refine((v) => Number(v) <= 100, {
		error: () => m.validation_tax_rate_max(),
	});

export const billingSettingsSchema = z.object({
	currency: z.enum(
		[
			"USD",
			"EUR",
			"GBP",
			"CAD",
			"MXN",
			"BRL",
			"ARS",
			"AUD",
			"JPY",
			"INR",
			"CHF",
			"SEK",
		],
		{ error: () => m.validation_choose_currency() },
	),
	defaultTaxRate: percentString,
	paymentTermsDays: z.coerce
		.number({ error: () => m.validation_days_number() })
		.int({ error: () => m.validation_days_whole() })
		.min(0, { error: () => m.validation_days_negative() })
		.max(365, { error: () => m.validation_days_max() }),
});

// Shared URL state for the product, order and invoice lists
export function listSearchSchema<
	const S extends readonly [string, ...string[]],
	const C extends readonly [string, ...string[]],
>(
	statuses: S,
	sortColumns: C,
	defaultSort: C[number],
	defaultDir: "asc" | "desc" = "desc",
) {
	return z.object({
		page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
		pageSize: z.coerce
			.number()
			.refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
			.catch(10)
			.default(10),
		q: z.string().trim().max(100).catch("").default(""),
		status: z.enum(statuses).optional().catch(undefined),
		sort: z.enum(sortColumns).catch(defaultSort).default(defaultSort),
		dir: z.enum(["asc", "desc"]).catch(defaultDir).default(defaultDir),
	});
}
