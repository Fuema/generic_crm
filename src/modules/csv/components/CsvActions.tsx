import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { CompanySearch, ContactSearch } from "#/modules/contacts/schema";
import type { FieldDef, ObjectKey } from "#/modules/fields/schema";
import { localized } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import { guessMapping, IMPORT_FIELDS } from "../columns";
import { CSV_LIMITS, parseCsv } from "../csv";
import { exportCsv, importCsv } from "../transfer";

type Status = { ok: boolean; message: string };
type Result = Awaited<ReturnType<typeof importCsv>>;

function download(name: string, text: string) {
	const url = URL.createObjectURL(
		new Blob([text], { type: "text/csv;charset=utf-8" }),
	);
	const link = Object.assign(document.createElement("a"), {
		href: url,
		download: name,
	});
	link.click();
	URL.revokeObjectURL(url);
}

// Export and import buttons above a list
export function CsvActions({
	objectKey,
	search,
	defs,
	canImport,
	canUpdate,
	onImported,
	onStatus,
}: {
	objectKey: ObjectKey;
	search: ContactSearch | CompanySearch;
	defs: FieldDef[];
	canImport: boolean;
	canUpdate: boolean;
	onImported: () => Promise<void>;
	onStatus: (status: Status) => void;
}) {
	const [exporting, setExporting] = useState(false);
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				type="button"
				variant="outline"
				disabled={exporting}
				onClick={async () => {
					setExporting(true);
					try {
						const result =
							objectKey === "contact"
								? await exportCsv({
										data: { objectKey, search: search as ContactSearch },
									})
								: await exportCsv({
										data: { objectKey, search: search as CompanySearch },
									});
						const day = new Date().toISOString().slice(0, 10);
						download(
							`${objectKey === "contact" ? "contacts" : "companies"}-${day}.csv`,
							result.csv,
						);
						onStatus({
							ok: true,
							message: m.export_done({ count: result.rows }),
						});
					} catch (e) {
						onStatus({ ok: false, message: await serverErrorMessage(e) });
					} finally {
						setExporting(false);
					}
				}}
			>
				<Download /> {m.export_button()}
			</Button>
			{canImport ? (
				<Button type="button" variant="outline" onClick={() => setOpen(true)}>
					<Upload /> {m.import_button()}
				</Button>
			) : null}
			{open ? (
				<ImportDialog
					objectKey={objectKey}
					defs={defs}
					canUpdate={canUpdate}
					onClose={() => setOpen(false)}
					onImported={onImported}
					onDone={async (result) => {
						setOpen(false);
						onStatus({
							ok: result.errors.length === 0,
							message: m.import_done({
								created: result.created,
								updated: result.updated,
								skipped: result.skipped,
								errors: result.errors.length,
							}),
						});
						await onImported();
					}}
				/>
			) : null}
		</>
	);
}

function ImportDialog({
	objectKey,
	defs,
	canUpdate,
	onClose,
	onDone,
	onImported,
}: {
	objectKey: ObjectKey;
	defs: FieldDef[];
	canUpdate: boolean;
	onClose: () => void;
	onDone: (result: Result) => Promise<void>;
	onImported: () => Promise<void>;
}) {
	// The file's rows without the header, once a file is chosen
	const [csv, setCsv] = useState<string[][] | null>(null);
	const [headers, setHeaders] = useState<string[]>([]);
	const [sample, setSample] = useState<string[]>([]);
	const [mapping, setMapping] = useState<string[]>([]);
	const [mode, setMode] = useState<"skip" | "update">("skip");
	const [check, setCheck] = useState<Result | null>(null);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const active = defs.filter((d) => !d.archivedAt);
	const fieldOptions = [
		...IMPORT_FIELDS[objectKey].map((f) => ({ id: f.id, label: f.label() })),
		...active.map((d) => ({
			id: `custom.${d.key}`,
			label: localized(d.label),
		})),
	];
	const requiredField = IMPORT_FIELDS[objectKey][0];

	// Columns the server needs from earlier rows to find duplicates in the file
	const keyFields = new Set([
		objectKey === "contact" ? "email" : "domain",
		...active.filter((d) => d.unique).map((d) => `custom.${d.key}`),
	]);
	const keysOnly = (cells: string[]) =>
		cells.map((cell, i) => (keyFields.has(mapping[i] ?? "") ? cell : ""));

	// The file goes in batches; the results add up
	const run = async (dryRun: boolean) => {
		setError(null);
		if (!mapping.includes(requiredField.id)) {
			setError(m.import_name_required({ field: requiredField.label() }));
			return;
		}
		const rows = csv ?? [];
		const total: Result = {
			total: 0,
			created: 0,
			updated: 0,
			skipped: 0,
			errors: [],
		};
		setBusy(true);
		let start = 0;
		try {
			for (; start < rows.length; start += CSV_LIMITS.importBatch) {
				setProgress(m.import_progress({ done: start, total: rows.length }));
				const result = await importCsv({
					data: {
						objectKey,
						rows: rows.slice(start, start + CSV_LIMITS.importBatch),
						start,
						earlier: rows.slice(0, start).map(keysOnly),
						mapping,
						mode,
						dryRun,
					},
				});
				total.total += result.total;
				total.created += result.created;
				total.updated += result.updated;
				total.skipped += result.skipped;
				total.errors = [...total.errors, ...result.errors].slice(0, 100);
			}
			if (dryRun) setCheck(total);
			else await onDone(total);
		} catch (e) {
			const message = await serverErrorMessage(e);
			// Earlier batches of a real import are already saved
			if (!dryRun && start > 0) {
				setError(
					m.import_stopped({ done: start, total: rows.length, message }),
				);
				await onImported();
			} else setError(message);
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{m.import_title()}</DialogTitle>
					<DialogDescription>
						{csv === null
							? m.import_step_file({ max: CSV_LIMITS.importRows })
							: m.import_step_map()}
					</DialogDescription>
				</DialogHeader>
				<FormAlert message={error} />

				{csv === null ? (
					<div className="space-y-2">
						<Label htmlFor="import-file">{m.import_file_label()}</Label>
						<Input
							id="import-file"
							type="file"
							accept=".csv,text/csv"
							onChange={async (e) => {
								setError(null);
								const file = e.target.files?.[0];
								if (!file) return;
								if (file.size > CSV_LIMITS.importBytes) {
									setError(m.import_error_too_big());
									return;
								}
								const text = await file.text();
								const rows = parseCsv(text);
								if (rows.length < 2) {
									setError(m.import_error_empty());
									return;
								}
								if (rows.length - 1 > CSV_LIMITS.importRows) {
									setError(
										m.import_error_too_many({ max: CSV_LIMITS.importRows }),
									);
									return;
								}
								setHeaders(rows[0]);
								setSample(rows[1]);
								setMapping(guessMapping(objectKey, rows[0], defs));
								setCsv(rows.slice(1));
							}}
						/>
					</div>
				) : check === null ? (
					<div className="space-y-4">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs text-muted-foreground">
									<th className="pb-2 font-medium">{m.import_column()}</th>
									<th className="pb-2 font-medium">{m.import_field()}</th>
								</tr>
							</thead>
							<tbody>
								{headers.map((header, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are positional; headers may repeat
									<tr key={`${header}-${i}`} className="border-t">
										<td className="py-2 pr-3 align-top">
											<p className="font-medium">{header || `#${i + 1}`}</p>
											{sample[i] ? (
												<p className="truncate text-xs text-muted-foreground">
													{m.import_example({ value: sample[i].slice(0, 40) })}
												</p>
											) : null}
										</td>
										<td className="py-2">
											<Label htmlFor={`map-${i}`} className="sr-only">
												{m.import_field()}
											</Label>
											<select
												id={`map-${i}`}
												className="h-9 w-full rounded-md border bg-background px-2"
												value={mapping[i] ?? ""}
												onChange={(e) =>
													setMapping((all) =>
														all.map((v, j) => (j === i ? e.target.value : v)),
													)
												}
											>
												<option value="">{m.import_ignore()}</option>
												{fieldOptions.map((f) => (
													<option key={f.id} value={f.id}>
														{f.label}
													</option>
												))}
											</select>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<fieldset className="space-y-2">
							<legend className="text-sm font-medium">
								{m.import_existing()}
							</legend>
							{(["skip", "update"] as const).map((value) => (
								<label key={value} className="flex items-center gap-2 text-sm">
									<input
										type="radio"
										name="import-mode"
										value={value}
										checked={mode === value}
										disabled={value === "update" && !canUpdate}
										onChange={() => setMode(value)}
									/>
									{value === "skip"
										? m.import_mode_skip()
										: m.import_mode_update()}
								</label>
							))}
						</fieldset>
					</div>
				) : (
					<div className="space-y-3 text-sm">
						<p>
							{m.import_summary({
								total: check.total,
								created: check.created,
								updated: check.updated,
								skipped: check.skipped,
								errors: check.errors.length,
							})}
						</p>
						{check.errors.length ? (
							<div className="space-y-1">
								<p className="font-medium">{m.import_errors_title()}</p>
								<ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
									{check.errors.map((e) => (
										<li key={e.row}>
											<span className="font-medium">
												{m.import_row({ row: e.row })}:
											</span>{" "}
											{e.message}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				)}

				<DialogFooter>
					{csv !== null ? (
						<Button
							type="button"
							variant="ghost"
							onClick={() => (check ? setCheck(null) : setCsv(null))}
						>
							{m.import_back()}
						</Button>
					) : null}
					{csv !== null && check === null ? (
						<Button type="button" disabled={busy} onClick={() => run(true)}>
							{busy ? (progress ?? m.import_checking()) : m.import_check()}
						</Button>
					) : null}
					{check ? (
						<Button
							type="button"
							disabled={busy || check.created + check.updated === 0}
							onClick={() => run(false)}
						>
							{busy
								? (progress ?? m.import_running())
								: m.import_run({ count: check.created + check.updated })}
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
