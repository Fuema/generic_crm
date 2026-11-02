// Ranked horizontal bars, largest first, one hue. Values sit at the bar tips, so
// nothing is hidden behind hover; a folded "Other" row is shown in gray.
export function RankedBars({
	rows,
	label,
}: {
	rows: { name: string; value: number; folded?: boolean }[];
	label: string;
}) {
	const max = Math.max(...rows.map((r) => r.value), 1);
	if (!rows.length) {
		return <p className="text-sm text-muted-foreground">No data yet.</p>;
	}
	return (
		<ul className="space-y-2.5" aria-label={label}>
			{rows.map((r) => (
				<li
					key={r.name}
					className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm"
				>
					<span className="truncate" title={r.name}>
						{r.name}
					</span>
					<div className="flex items-center gap-2">
						<div
							className="h-3 rounded-r"
							style={{
								width: `${(r.value / max) * 100}%`,
								minWidth: r.value > 0 ? 4 : 0,
								background: r.folded ? "var(--viz-deemph)" : "var(--viz-1)",
							}}
							aria-hidden="true"
						/>
						<span className="font-medium tabular-nums">{r.value}</span>
					</div>
				</li>
			))}
		</ul>
	);
}
