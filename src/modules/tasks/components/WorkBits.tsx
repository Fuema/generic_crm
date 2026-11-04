import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { orderNumberLabel, quoteNumberLabel } from "#/lib/money";
import { invoiceLabel } from "#/modules/invoices/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { dayKeyLocal, formatTime, itemDayKey } from "../calendar";
import {
	SUBJECT_TYPE_LABELS,
	TASK_PRIORITY_LABELS,
	type TaskPriority,
	WORK_SUBJECT_TYPES,
	type WorkSubjectType,
} from "../schema";

const PRIORITY_VARIANTS: Record<
	TaskPriority,
	"outline" | "secondary" | "default" | "destructive"
> = {
	low: "outline",
	medium: "secondary",
	high: "default",
	urgent: "destructive",
};

// The priority as a word (never color only)
export function PriorityBadge({ priority }: { priority: string }) {
	const p = (
		priority in TASK_PRIORITY_LABELS ? priority : "medium"
	) as TaskPriority;
	return (
		<Badge variant={PRIORITY_VARIANTS[p]}>{TASK_PRIORITY_LABELS[p]()}</Badge>
	);
}

export function initials(name: string | null | undefined) {
	const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
	return (
		(
			(parts[0]?.[0] ?? "") +
			(parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
		).toUpperCase() || "?"
	);
}

export function isSubjectType(type: string | null): type is WorkSubjectType {
	return (WORK_SUBJECT_TYPES as readonly string[]).includes(type ?? "");
}

// What to call a linked record: a name, or a document number
export function subjectLabel(
	type: string | null,
	row: {
		subjectName?: string | null;
		subjectNumber?: number | null;
		subjectYear?: number | null;
	},
) {
	switch (type) {
		case "contact":
		case "company":
		case "deal":
			return row.subjectName || SUBJECT_TYPE_LABELS[type]();
		case "quote":
			return row.subjectNumber
				? quoteNumberLabel(row.subjectNumber)
				: SUBJECT_TYPE_LABELS.quote();
		case "order":
			return row.subjectNumber
				? orderNumberLabel(row.subjectNumber)
				: SUBJECT_TYPE_LABELS.order();
		case "invoice":
			return (
				invoiceLabel(row.subjectYear ?? null, row.subjectNumber ?? null) ||
				m.invoice_doc_draft()
			);
		default:
			return "";
	}
}

// A link to the record a task or activity is about
export function SubjectLink({
	type,
	id,
	label,
	className = "hover:underline",
}: {
	type: string | null;
	id: string | null;
	label: string;
	className?: string;
}) {
	if (!id || !isSubjectType(type)) return null;
	const props = {
		className,
		onClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
	};
	switch (type) {
		case "contact":
			return (
				<Link to="/contacts/$contactId" params={{ contactId: id }} {...props}>
					{label}
				</Link>
			);
		case "company":
			return (
				<Link to="/companies/$companyId" params={{ companyId: id }} {...props}>
					{label}
				</Link>
			);
		case "deal":
			return (
				<Link to="/deals/$dealId" params={{ dealId: id }} {...props}>
					{label}
				</Link>
			);
		case "quote":
			return (
				<Link to="/quotes/$quoteId" params={{ quoteId: id }} {...props}>
					{label}
				</Link>
			);
		case "order":
			return (
				<Link to="/orders/$orderId" params={{ orderId: id }} {...props}>
					{label}
				</Link>
			);
		case "invoice":
			return (
				<Link to="/invoices/$invoiceId" params={{ invoiceId: id }} {...props}>
					{label}
				</Link>
			);
	}
}

// When a task is due, and whether it is late
export function dueLabel(t: {
	dueAt: Date | string | null;
	allDay: boolean;
	status: string;
}) {
	if (!t.dueAt) return null;
	const key = itemDayKey(t.dueAt, t.allDay);
	const today = dayKeyLocal(new Date());
	const [y, mo, d] = key.split("-").map(Number);
	const date = new Date(y, mo - 1, d).toLocaleDateString(getLocale(), {
		month: "short",
		day: "numeric",
	});
	const overdue = t.status !== "done" && key < today;
	return {
		text: `${key === today ? m.work_today() : date}${t.allDay ? "" : ` ${formatTime(t.dueAt)}`}`,
		overdue,
	};
}
