import {
	createFileRoute,
	notFound,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { OptionSelect } from "#/modules/contacts/components/fields";
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import { localized } from "#/modules/fields/schema";
import { type FormValue, formatValue } from "#/modules/fields/values";
import { PortalShell } from "#/modules/portal/components/PortalBits";
import { getPortalProfile, updatePortalProfile } from "#/modules/portal/portal";
import { portalProfileSchema } from "#/modules/portal/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale, type Locale, setLocale } from "#/paraglide/runtime.js";

// The contact's own details in the portal (spec §8, owner decisions
// 2026-11-04): name, phone, job title, language and marketing consent are
// theirs to change, saved at once; the email stays with staff; custom fields
// show only where staff chose, and can be edited only where marked editable.
export const Route = createFileRoute("/p/$slug/profile")({
	loader: async ({ params }) => {
		try {
			return await getPortalProfile({ data: { slug: params.slug } });
		} catch (e) {
			if (e instanceof Response && e.status === 401)
				throw redirect({
					to: "/p/$slug/sign-in",
					params: { slug: params.slug },
				});
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	head: () => ({ meta: [{ title: m.portal_profile_title() }] }),
	component: ProfilePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_portal_not_found()}
		</p>
	),
});

function ProfilePage() {
	const router = useRouter();
	const { slug } = Route.useParams();
	const { portal, profile } = Route.useLoaderData();
	const editable = profile.fieldSet.fields.filter(
		(f) => f.portalVisibility === "editable",
	);
	const readOnly = profile.fieldSet.fields.filter(
		(f) => f.portalVisibility === "read_only",
	);
	const [value, setValue] = useState({
		firstName: profile.firstName,
		lastName: profile.lastName ?? "",
		phone: profile.phone ?? "",
		jobTitle: profile.jobTitle ?? "",
		// Unset stays unset (the workspace default) unless the contact picks one
		locale: (profile.locale === "es" || profile.locale === "en"
			? profile.locale
			: "") as "" | "en" | "es",
		marketing: profile.emailConsent === "granted",
	});
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(editable, profile.custom),
	);
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);
	const patch = (p: Partial<typeof value>) => setValue((v) => ({ ...v, ...p }));
	const name = [portal.firstName, portal.lastName].filter(Boolean).join(" ");

	const submit = async () => {
		const { input, errors } = toCustomInput(editable, custom);
		setCustomErrors(errors);
		const parsed = portalProfileSchema.safeParse({ ...value, custom: input });
		if (!parsed.success || Object.keys(errors).length) {
			setNotice({
				ok: false,
				message:
					parsed.error?.issues[0]?.message ??
					Object.values(errors)[0] ??
					m.error_generic(),
			});
			return;
		}
		setBusy(true);
		try {
			await updatePortalProfile({ data: { slug, profile: parsed.data } });
			setNotice({ ok: true, message: m.portal_profile_saved() });
			// The portal follows the language just chosen (reloads the page)
			if (parsed.data.locale && parsed.data.locale !== getLocale())
				setLocale(parsed.data.locale as Locale);
			else await router.invalidate();
		} catch (e) {
			setNotice({ ok: false, message: await serverErrorMessage(e) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<PortalShell
			slug={slug}
			workspaceName={portal.workspaceName}
			contactName={name}
		>
			<h1 className="text-2xl font-bold">{m.portal_profile_title()}</h1>
			<Card>
				<CardHeader>
					<CardTitle>{m.portal_profile_details()}</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						noValidate
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void submit();
						}}
					>
						<FormAlert
							message={notice?.message ?? null}
							variant={notice?.ok ? "success" : "destructive"}
						/>
						<fieldset disabled={busy} className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="profile-first">
										{m.contact_first_name()}
									</Label>
									<Input
										id="profile-first"
										value={value.firstName}
										maxLength={100}
										autoComplete="given-name"
										required
										onChange={(e) => patch({ firstName: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="profile-last">{m.contact_last_name()}</Label>
									<Input
										id="profile-last"
										value={value.lastName}
										maxLength={100}
										autoComplete="family-name"
										onChange={(e) => patch({ lastName: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="profile-email">{m.common_email()}</Label>
									<Input
										id="profile-email"
										value={profile.email ?? ""}
										readOnly
										aria-describedby="profile-email-hint"
									/>
									<p
										id="profile-email-hint"
										className="text-xs text-muted-foreground"
									>
										{m.portal_profile_email_hint()}
									</p>
								</div>
								<div className="space-y-2">
									<Label htmlFor="profile-phone">{m.common_phone()}</Label>
									<Input
										id="profile-phone"
										type="tel"
										value={value.phone}
										maxLength={25}
										autoComplete="tel"
										onChange={(e) => patch({ phone: e.target.value })}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="profile-job">{m.contact_job_title()}</Label>
									<Input
										id="profile-job"
										value={value.jobTitle}
										maxLength={100}
										autoComplete="organization-title"
										onChange={(e) => patch({ jobTitle: e.target.value })}
									/>
								</div>
								<OptionSelect
									id="profile-locale"
									label={m.contact_language()}
									value={value.locale || (getLocale() === "es" ? "es" : "en")}
									onChange={(v) => patch({ locale: v === "es" ? "es" : "en" })}
									options={[
										{ value: "en", label: m.language_en() },
										{ value: "es", label: m.language_es() },
									]}
								/>
							</div>
							<div className="flex items-start gap-2">
								<Checkbox
									id="profile-marketing"
									checked={value.marketing}
									onCheckedChange={(c) => patch({ marketing: c === true })}
								/>
								<Label htmlFor="profile-marketing" className="font-normal">
									{m.portal_profile_marketing()}
								</Label>
							</div>
							{editable.length ? (
								<CustomFieldInputs
									fields={{ ...profile.fieldSet, fields: editable }}
									values={custom}
									errors={customErrors}
									onChange={(key, v) => setCustom((c) => ({ ...c, [key]: v }))}
								/>
							) : null}
						</fieldset>
						<Button type="submit" disabled={busy}>
							{busy ? m.common_saving() : m.common_save_changes()}
						</Button>
					</form>
				</CardContent>
			</Card>
			{readOnly.length ? (
				<Card>
					<CardHeader>
						<CardTitle>{m.portal_profile_more()}</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-3 sm:grid-cols-2">
							{readOnly.map((f) => (
								<div key={f.key}>
									<dt className="text-xs text-muted-foreground">
										{localized(f.label)}
									</dt>
									<dd className="text-sm">
										{formatValue(
											f,
											profile.custom[f.key],
											profile.fieldSet.currency,
										) || m.common_none()}
									</dd>
								</div>
							))}
						</dl>
					</CardContent>
				</Card>
			) : null}
		</PortalShell>
	);
}
