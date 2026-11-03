import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, Merge } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import { getContact, mergeContacts } from "#/modules/contacts/contacts";
import {
	MERGE_FIELDS,
	type MergeField,
	type MergeSide,
	mergeConflicts,
	mergeSource,
} from "#/modules/contacts/merge";
import {
	CONSENT_LABELS,
	contactName,
	type EmailConsent,
	type LifecycleStage,
	STAGE_LABELS,
} from "#/modules/contacts/schema";
import { getRecordFields } from "#/modules/fields/fields";
import { localized } from "#/modules/fields/schema";
import { formatValue } from "#/modules/fields/values";
import { getTimeline } from "#/modules/records/records";
import { m } from "#/paraglide/messages.js";

const searchSchema = z.object({
	keep: z.uuid().optional().catch(undefined),
	duplicate: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/contacts/merge")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const { keep, duplicate } = deps;
		if (!keep || !duplicate || keep === duplicate) throw notFound();
		try {
			const [kept, dup, keptTimeline, dupTimeline, fields] = await Promise.all([
				getContact({ data: { id: keep } }),
				getContact({ data: { id: duplicate } }),
				getTimeline({ data: { subjectType: "contact", subjectId: keep } }),
				getTimeline({ data: { subjectType: "contact", subjectId: duplicate } }),
				getRecordFields({ data: { objectKey: "contact" } }),
			]);
			return {
				kept,
				dup,
				keptTagIds: keptTimeline.tags.map((t) => t.id),
				dupTags: dupTimeline.tags,
				dupNotes: dupTimeline.notes.length,
				fields,
			};
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: MergePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_contact_not_found()}
		</p>
	),
});

const BUILT_IN_LABELS: Record<MergeField, () => string> = {
	firstName: m.contact_first_name,
	lastName: m.contact_last_name,
	email: m.contact_email,
	phone: m.common_phone,
	jobTitle: m.contact_job_title,
	companyId: m.contact_company,
	ownerId: m.common_owner,
	lifecycleStage: m.contact_stage,
	locale: m.contact_language,
	emailConsent: m.contact_consent,
};

type Detail = Awaited<ReturnType<typeof getContact>>;

// How a built-in value reads on screen (names instead of ids, labels for enums)
function builtInText(field: MergeField, detail: Detail) {
	const c = detail.contact;
	switch (field) {
		case "companyId":
			return detail.company?.name ?? "";
		case "ownerId":
			return c.ownerId ? (detail.ownerName ?? "") : "";
		case "lifecycleStage":
			return STAGE_LABELS[c.lifecycleStage as LifecycleStage]?.() ?? "";
		case "locale":
			return c.locale === "es"
				? m.language_es()
				: c.locale === "en"
					? m.language_en()
					: "";
		case "emailConsent":
			return c.emailConsent === "unknown"
				? ""
				: (CONSENT_LABELS[c.emailConsent as EmailConsent]?.() ?? "");
		default:
			return c[field] ?? "";
	}
}

function MergePage() {
	const navigate = useNavigate();
	const { kept, dup, keptTagIds, dupTags, dupNotes, fields } =
		Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const canMerge = roleCan(access?.role, { contact: ["update", "delete"] });
	const keep = kept.contact;
	const duplicate = dup.contact;
	const [choices, setChoices] = useState<Record<string, MergeSide>>({});
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const conflicts = new Set(mergeConflicts(keep, duplicate));
	const keepName = contactName(keep);
	const dupName = contactName(duplicate);
	const tagsMoving = dupTags.filter((t) => !keptTagIds.includes(t.id)).length;
	const archived = Boolean(keep.archivedAt || duplicate.archivedAt);

	// Rows: every built-in field and every active custom field with a value on
	// either side
	const rows = [
		...MERGE_FIELDS.map((field) => ({
			field: field as string,
			label: BUILT_IN_LABELS[field](),
			a: builtInText(field, kept),
			b: builtInText(field, dup),
		})),
		...fields.fields.map((def) => ({
			field: `custom.${def.key}`,
			label: localized(def.label),
			a: formatValue(def, keep.custom[def.key], fields.currency),
			b: formatValue(def, duplicate.custom[def.key], fields.currency),
		})),
	].filter((row) => row.a || row.b);

	const swap = () =>
		navigate({
			to: "/contacts/merge",
			search: { keep: duplicate.id, duplicate: keep.id },
			replace: true,
		});

	const confirm = async () => {
		if (
			!window.confirm(
				m.merge_confirm_prompt({ duplicate: dupName, keep: keepName }),
			)
		)
			return;
		setBusy(true);
		setError(null);
		try {
			await mergeContacts({
				data: { keepId: keep.id, duplicateId: duplicate.id, choices },
			});
			await navigate({
				to: "/contacts/$contactId",
				params: { contactId: keep.id },
			});
		} catch (e) {
			setError(await serverErrorMessage(e));
			setBusy(false);
		}
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<Link
				to="/contacts/$contactId"
				params={{ contactId: keep.id }}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> {m.merge_back({ name: keepName })}
			</Link>

			<div className="space-y-1">
				<h1 className="text-2xl font-bold">{m.merge_title()}</h1>
				<p className="text-sm text-muted-foreground">{m.merge_description()}</p>
			</div>

			{archived ? <FormAlert message={m.error_record_archived()} /> : null}
			<FormAlert message={error} variant="destructive" />

			<Card>
				<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
					<CardTitle>
						{conflicts.size
							? m.merge_choose({ count: conflicts.size })
							: m.merge_no_conflicts()}
					</CardTitle>
					<Button type="button" variant="outline" size="sm" onClick={swap}>
						<ArrowLeftRight /> {m.merge_swap()}
					</Button>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left text-xs text-muted-foreground">
								<th scope="col" className="py-2 pr-3 font-medium">
									{m.merge_col_field()}
								</th>
								<th scope="col" className="py-2 pr-3 font-medium">
									{m.merge_col_keep({ name: keepName })}
								</th>
								<th scope="col" className="py-2 font-medium">
									{m.merge_col_duplicate({ name: dupName })}
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const side = mergeSource(row.field, keep, duplicate, choices);
								const conflict = conflicts.has(row.field);
								const cell = (which: MergeSide, text: string) => {
									const used = side === which;
									return (
										<td
											className={`py-2 pr-3 align-top break-words ${used ? "font-medium" : "text-muted-foreground line-through decoration-muted-foreground/50"}`}
										>
											{conflict ? (
												<label className="flex cursor-pointer items-start gap-2">
													<input
														type="radio"
														className="mt-1"
														name={`merge-${row.field}`}
														checked={used}
														onChange={() =>
															setChoices((c) => ({ ...c, [row.field]: which }))
														}
													/>
													<span>{text}</span>
												</label>
											) : (
												<span>
													{text || m.common_none()}
													{used && which === "duplicate" ? (
														<span className="ml-2 text-xs text-muted-foreground no-underline">
															({m.merge_filled()})
														</span>
													) : null}
												</span>
											)}
										</td>
									);
								};
								return (
									<tr key={row.field} className="border-b last:border-0">
										<th
											scope="row"
											className="py-2 pr-3 text-left align-top text-xs font-normal text-muted-foreground"
										>
											{row.label}
										</th>
										{cell("keep", row.a)}
										{cell("duplicate", row.b)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{m.merge_what_happens()}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="list-disc space-y-1 pl-5 text-sm">
						<li>{m.merge_moves_notes({ count: dupNotes })}</li>
						<li>{m.merge_moves_tags({ count: tagsMoving })}</li>
						<li>{m.merge_archives({ name: dupName })}</li>
						<li>{m.merge_no_undo()}</li>
					</ul>
				</CardContent>
			</Card>

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						navigate({
							to: "/contacts/$contactId",
							params: { contactId: keep.id },
						})
					}
				>
					{m.common_cancel()}
				</Button>
				<Button
					type="button"
					onClick={confirm}
					disabled={!canMerge || archived || busy}
				>
					<Merge /> {m.merge_confirm()}
				</Button>
			</div>
		</div>
	);
}
