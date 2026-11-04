import {
	ArrowDown,
	ArrowUp,
	Columns3,
	Filter as FilterIcon,
	Save,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
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
import type { FieldDef, ObjectKey } from "#/modules/fields/schema";
import { localized } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import {
	BUILT_IN_COLUMNS,
	DEFAULT_COLUMNS,
	DEFAULT_SORT,
	type Filter,
	type ViewConfig,
} from "../schema";
import {
	createView,
	deleteView,
	type SavedViewRow,
	updateView,
} from "../views";
import { type FilterChoices, FilterEditor } from "./FilterEditor";

export type ViewState = {
	filters: Filter[];
	columns?: string[];
	sort: string;
	dir: "asc" | "desc";
	view?: string;
};

const BUILT_IN_COLUMN_LABELS: Record<string, () => string> = {
	email: m.contact_email,
	phone: m.common_phone,
	jobTitle: m.contact_job_title,
	companyId: m.contacts_col_company,
	lifecycleStage: m.contacts_col_stage,
	tags: m.contacts_col_tags,
	ownerId: m.common_owner,
	emailConsent: m.contact_consent,
	createdAt: m.contacts_col_added,
	domain: m.companies_col_domain,
	contactCount: m.companies_col_contacts,
	location: m.companies_col_location,
	valueCents: m.deals_col_value,
	stageId: m.deal_stage,
	status: m.deal_status,
	contactId: m.deal_contact,
	expectedCloseAt: m.deal_expected_close,
	sku: m.product_sku,
	unitPriceCents: m.product_price_col,
	description: m.product_description,
	dealId: m.quote_deal,
	totalCents: m.quote_total,
	validUntil: m.quote_valid_until,
	orderDate: m.order_date,
	orderId: m.invoice_order,
	issueDate: m.invoice_issue_date,
	dueDate: m.invoice_due_date,
};

export function columnLabel(column: string, defs: FieldDef[]) {
	if (column.startsWith("custom.")) {
		const def = defs.find((d) => `custom.${d.key}` === column);
		return def ? localized(def.label) : column;
	}
	return BUILT_IN_COLUMN_LABELS[column]?.() ?? column;
}

export function currentConfig(
	objectKey: ObjectKey,
	state: ViewState,
): ViewConfig {
	return {
		filters: state.filters,
		columns: state.columns ?? DEFAULT_COLUMNS[objectKey],
		sort: { field: state.sort, dir: state.dir },
	};
}

// The state that opens a view (or the plain list when no view is given)
export function stateForView(objectKey: ObjectKey, view: SavedViewRow | null) {
	if (!view) {
		return {
			view: undefined,
			filters: [] as Filter[],
			columns: undefined,
			sort: DEFAULT_SORT[objectKey].field,
			dir: DEFAULT_SORT[objectKey].dir,
			page: 1,
		};
	}
	return {
		view: view.id,
		filters: view.config.filters,
		columns: view.config.columns,
		sort: view.config.sort.field,
		dir: view.config.sort.dir,
		page: 1,
	};
}

function ColumnsDialog({
	open,
	onOpenChange,
	objectKey,
	columns,
	defs,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	objectKey: ObjectKey;
	columns: string[];
	defs: FieldDef[];
	onApply: (columns: string[]) => void;
}) {
	const all = [
		...BUILT_IN_COLUMNS[objectKey],
		...defs.filter((d) => !d.archivedAt).map((d) => `custom.${d.key}`),
	];
	const [chosen, setChosen] = useState<string[]>(columns);
	const ordered = [...chosen, ...all.filter((c) => !chosen.includes(c))];
	const move = (column: string, delta: -1 | 1) => {
		const i = chosen.indexOf(column);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= chosen.length) return;
		const next = [...chosen];
		[next[i], next[j]] = [next[j], next[i]];
		setChosen(next);
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{m.columns_title()}</DialogTitle>
					<DialogDescription>{m.columns_hint()}</DialogDescription>
				</DialogHeader>
				<ul className="divide-y">
					{ordered.map((column) => {
						const on = chosen.includes(column);
						const label = columnLabel(column, defs);
						const i = chosen.indexOf(column);
						return (
							<li key={column} className="flex items-center gap-2 py-1.5">
								<Checkbox
									id={`column-${column}`}
									checked={on}
									onCheckedChange={(c) =>
										setChosen((list) =>
											c === true
												? [...list, column]
												: list.filter((x) => x !== column),
										)
									}
								/>
								<Label
									htmlFor={`column-${column}`}
									className="flex-1 font-normal"
								>
									{label}
								</Label>
								{on ? (
									<>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={i === 0}
											aria-label={m.fields_move_up({ name: label })}
											onClick={() => move(column, -1)}
										>
											<ArrowUp />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={i === chosen.length - 1}
											aria-label={m.fields_move_down({ name: label })}
											onClick={() => move(column, 1)}
										>
											<ArrowDown />
										</Button>
									</>
								) : null}
							</li>
						);
					})}
				</ul>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setChosen(DEFAULT_COLUMNS[objectKey])}
					>
						{m.columns_reset()}
					</Button>
					<Button type="button" onClick={() => onApply(chosen)}>
						{m.filters_apply()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SaveDialog({
	open,
	onOpenChange,
	initialName,
	initialShared,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialName: string;
	initialShared: boolean;
	onSave: (name: string, shared: boolean) => Promise<void>;
}) {
	const [name, setName] = useState(initialName);
	const [shared, setShared] = useState(initialShared);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{m.views_new_title()}</DialogTitle>
					<DialogDescription>{m.views_new_description()}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="space-y-4"
					onSubmit={async (e) => {
						e.preventDefault();
						setError(null);
						setBusy(true);
						try {
							await onSave(name.trim(), shared);
						} catch (err) {
							setError(await serverErrorMessage(err));
						} finally {
							setBusy(false);
						}
					}}
				>
					<FormAlert message={error} />
					<div className="space-y-2">
						<Label htmlFor="view-name">{m.views_name()}</Label>
						<Input
							id="view-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={60}
						/>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="view-shared"
							checked={shared}
							onCheckedChange={(c) => setShared(c === true)}
						/>
						<Label htmlFor="view-shared" className="font-normal">
							{m.views_share()}
						</Label>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button type="submit" disabled={busy || !name.trim()}>
							{busy ? m.common_saving() : m.views_save()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Views menu, filters, columns and saving, above a contact or company list
export function ViewToolbar({
	objectKey,
	state,
	views,
	defs,
	choices,
	onChange,
	onViewsChanged,
	onStatus,
}: {
	objectKey: ObjectKey;
	state: ViewState;
	views: SavedViewRow[];
	defs: FieldDef[];
	choices: FilterChoices;
	onChange: (patch: Partial<ViewState> & { page?: number }) => void;
	onViewsChanged: () => Promise<void>;
	onStatus: (status: { ok: boolean; message: string }) => void;
}) {
	const [dialog, setDialog] = useState<"filters" | "columns" | "save" | null>(
		null,
	);
	const active = views.find((v) => v.id === state.view) ?? null;
	const config = currentConfig(objectKey, state);
	const changed =
		active !== null && JSON.stringify(config) !== JSON.stringify(active.config);
	const mine = views.filter((v) => v.ownerId && !v.shared);
	const shared = views.filter((v) => v.shared);

	const run = async (action: () => Promise<unknown>, message: string) => {
		try {
			await action();
			onStatus({ ok: true, message });
			await onViewsChanged();
		} catch (e) {
			onStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="flex flex-wrap items-end gap-2">
			<div className="space-y-1.5">
				<Label htmlFor={`${objectKey}-view`}>{m.views_label()}</Label>
				<select
					id={`${objectKey}-view`}
					className="h-9 rounded-md border bg-background px-2 text-sm"
					value={state.view ?? ""}
					onChange={(e) =>
						onChange(
							stateForView(
								objectKey,
								views.find((v) => v.id === e.target.value) ?? null,
							),
						)
					}
				>
					<option value="">{m.views_default()}</option>
					{mine.length ? (
						<optgroup label={m.views_mine()}>
							{mine.map((v) => (
								<option key={v.id} value={v.id}>
									{v.name}
								</option>
							))}
						</optgroup>
					) : null}
					{shared.length ? (
						<optgroup label={m.views_shared()}>
							{shared.map((v) => (
								<option key={v.id} value={v.id}>
									{v.name}
								</option>
							))}
						</optgroup>
					) : null}
				</select>
			</div>
			<Button
				type="button"
				variant="outline"
				onClick={() => setDialog("filters")}
			>
				<FilterIcon />
				{state.filters.length
					? m.filters_count({ count: state.filters.length })
					: m.filters_button()}
			</Button>
			<Button
				type="button"
				variant="outline"
				onClick={() => setDialog("columns")}
			>
				<Columns3 /> {m.columns_button()}
			</Button>
			{active && changed && active.canEdit ? (
				<Button
					type="button"
					onClick={() =>
						run(
							() => updateView({ data: { id: active.id, config } }),
							m.views_saved({ name: active.name }),
						)
					}
				>
					<Save /> {m.views_update()}
				</Button>
			) : null}
			<Button
				type="button"
				variant={active ? "ghost" : "outline"}
				onClick={() => setDialog("save")}
			>
				{active ? m.views_save_as() : m.views_save()}
			</Button>
			{active?.canEdit ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={m.views_delete()}
					onClick={() => {
						if (!window.confirm(m.views_delete_confirm({ name: active.name })))
							return;
						void run(
							async () => {
								await deleteView({ data: { id: active.id } });
								onChange(stateForView(objectKey, null));
							},
							m.views_deleted({ name: active.name }),
						);
					}}
				>
					<Trash2 />
				</Button>
			) : null}
			{changed ? (
				<span className="pb-2 text-xs text-muted-foreground">
					{m.views_unsaved()}
				</span>
			) : null}
			{active?.shared && active.ownerName ? (
				<span className="pb-2 text-xs text-muted-foreground">
					{m.views_shared_by({ name: active.ownerName })}
				</span>
			) : null}

			<FilterEditor
				open={dialog === "filters"}
				onOpenChange={(o) => !o && setDialog(null)}
				objectKey={objectKey}
				filters={state.filters}
				defs={defs}
				choices={choices}
				onApply={(filters) => {
					setDialog(null);
					onChange({ filters, page: 1 });
				}}
			/>
			{dialog === "columns" ? (
				<ColumnsDialog
					open
					onOpenChange={(o) => !o && setDialog(null)}
					objectKey={objectKey}
					columns={config.columns}
					defs={defs}
					onApply={(columns) => {
						setDialog(null);
						onChange({ columns });
					}}
				/>
			) : null}
			{dialog === "save" ? (
				<SaveDialog
					open
					onOpenChange={(o) => !o && setDialog(null)}
					initialName=""
					initialShared={false}
					onSave={async (name, isShared) => {
						const { id } = await createView({
							data: { objectKey, name, shared: isShared, config },
						});
						setDialog(null);
						onStatus({ ok: true, message: m.views_saved({ name }) });
						await onViewsChanged();
						onChange({ view: id });
					}}
				/>
			) : null}
		</div>
	);
}
