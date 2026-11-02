import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";

// Radix Select can't hold "", so "no value" travels as this sentinel
const NONE = "__none__";

// A labelled select whose empty choice maps to "" in the form value
export function OptionSelect({
	id,
	label,
	value,
	onChange,
	options,
	emptyLabel,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
	emptyLabel?: string;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={value === "" ? NONE : value}
				onValueChange={(v) => onChange(v === NONE ? "" : v)}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{emptyLabel !== undefined ? (
						<SelectItem value={NONE}>{emptyLabel}</SelectItem>
					) : null}
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
