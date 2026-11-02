import { Badge } from "#/components/ui/badge";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { TaskPriority, TaskStatus } from "#/lib/schema";

export const NONE = "__none__";

export const STATUS_LABELS: Record<TaskStatus, string> = {
	backlog: "Backlog",
	todo: "To do",
	in_progress: "In progress",
	review: "Review",
	done: "Done",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	urgent: "Urgent",
};

const PRIORITY_VARIANTS: Record<
	TaskPriority,
	"outline" | "secondary" | "default" | "destructive"
> = {
	low: "outline",
	medium: "secondary",
	high: "default",
	urgent: "destructive",
};

export function PriorityBadge({ priority }: { priority: string }) {
	const p = (priority in PRIORITY_LABELS ? priority : "medium") as TaskPriority;
	return <Badge variant={PRIORITY_VARIANTS[p]}>{PRIORITY_LABELS[p]}</Badge>;
}

// A labelled select whose empty choice maps to null
export function OptionSelect({
	id,
	label,
	value,
	onChange,
	options,
	noneLabel,
	disabled,
}: {
	id: string;
	label: string;
	value: string | null;
	onChange: (value: string | null) => void;
	options: { value: string; label: string }[];
	noneLabel?: string;
	disabled?: boolean;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={value ?? NONE}
				onValueChange={(v) => onChange(v === NONE ? null : v)}
				disabled={disabled}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="max-h-72">
					{noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
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
