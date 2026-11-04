import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { m } from "#/paraglide/messages.js";
import {
	SUBJECT_TYPE_LABELS,
	WORK_SUBJECT_TYPES,
	type WorkSubjectType,
} from "../schema";
import { type SubjectChoice, searchWorkSubjects } from "../tasks";
import { subjectLabel } from "./WorkBits";

export type PickedSubject = {
	type: WorkSubjectType | "";
	id: string;
	label: string;
};

export const NO_SUBJECT: PickedSubject = { type: "", id: "", label: "" };

function choiceLabel(type: WorkSubjectType, c: SubjectChoice) {
	return subjectLabel(type, {
		subjectName: c.name,
		subjectNumber: c.number,
		subjectYear: c.year,
	});
}

// The one record a task or activity is about: a type, then a search over that
// type's active records
export function SubjectPicker({
	idPrefix,
	value,
	onChange,
	invalid,
}: {
	idPrefix: string;
	value: PickedSubject;
	onChange: (value: PickedSubject) => void;
	invalid: boolean;
}) {
	const [q, setQ] = useState("");
	const [rows, setRows] = useState<SubjectChoice[]>([]);
	const [searching, setSearching] = useState(false);
	const type = value.type;

	useEffect(() => {
		if (!type || value.id) return;
		let cancelled = false;
		const timer = setTimeout(async () => {
			setSearching(true);
			try {
				const found = await searchWorkSubjects({ data: { type, q } });
				if (!cancelled) setRows(found);
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [type, q, value.id]);

	return (
		<div className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
			<OptionSelect
				id={`${idPrefix}-subject-type`}
				label={m.work_related_to()}
				value={type}
				emptyLabel={m.work_subject_none()}
				options={WORK_SUBJECT_TYPES.map((t) => ({
					value: t,
					label: SUBJECT_TYPE_LABELS[t](),
				}))}
				onChange={(t) => {
					setQ("");
					setRows([]);
					onChange({ type: t as WorkSubjectType | "", id: "", label: "" });
				}}
			/>
			{type ? (
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-subject`}>
						{SUBJECT_TYPE_LABELS[type]()}
					</Label>
					{value.id ? (
						<div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
							<span
								id={`${idPrefix}-subject`}
								className="truncate text-sm font-medium"
							>
								{value.label}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => onChange({ type, id: "", label: "" })}
							>
								{m.deal_contact_change()}
							</Button>
						</div>
					) : (
						<>
							<Input
								id={`${idPrefix}-subject`}
								type="search"
								value={q}
								aria-invalid={invalid || undefined}
								placeholder={m.work_subject_search()}
								onChange={(e) => setQ(e.target.value)}
							/>
							<ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
								{rows.map((c) => (
									<li key={c.id}>
										<button
											type="button"
											className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
											onClick={() =>
												onChange({
													type,
													id: c.id,
													label: choiceLabel(type, c),
												})
											}
										>
											<span className="truncate">{choiceLabel(type, c)}</span>
											{c.detail ? (
												<span className="truncate text-xs text-muted-foreground">
													{c.detail}
												</span>
											) : null}
										</button>
									</li>
								))}
								{!rows.length && !searching ? (
									<li className="px-3 py-1.5 text-sm text-muted-foreground">
										{m.work_no_results()}
									</li>
								) : null}
							</ul>
						</>
					)}
				</div>
			) : null}
		</div>
	);
}
