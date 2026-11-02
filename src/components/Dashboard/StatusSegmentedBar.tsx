import { useState } from "react";

export type Segment = { name: string; value: number; color: string };

// Tall segmented bar: one whole split into ≤ 6 parts. Each block prints its share
// when it fits; hover/focus gives name, count and share; the legend names the
// parts in block order (identity never depends on color alone).
export function StatusSegmentedBar({
	segments,
	label,
}: {
	segments: Segment[];
	label: string;
}) {
	const [active, setActive] = useState<number | null>(null);
	const total = segments.reduce((sum, s) => sum + s.value, 0);
	const visible = segments.filter((s) => s.value > 0);
	const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

	if (total === 0) {
		return <p className="text-sm text-muted-foreground">No customers yet.</p>;
	}

	return (
		<div className="space-y-3">
			<ul className="flex h-7 gap-0.5" aria-label={label}>
				{visible.map((s, i) => {
					const pct = share(s.value);
					return (
						<li
							key={s.name}
							className="relative"
							style={{ width: `${(s.value / total) * 100}%` }}
						>
							<button
								type="button"
								aria-label={`${s.name}: ${s.value} (${pct}%)`}
								className="flex h-full w-full cursor-default items-center rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
								style={{
									background: s.color,
									opacity: active === null || active === i ? 1 : 0.6,
								}}
								onPointerEnter={() => setActive(i)}
								onPointerLeave={() => setActive(null)}
								onFocus={() => setActive(i)}
								onBlur={() => setActive(null)}
							>
								{/* Only print the share where it fits; otherwise tooltip + table carry it */}
								{pct >= 12 ? (
									<span
										className="text-xs font-semibold text-white"
										aria-hidden="true"
									>
										{pct}%
									</span>
								) : null}
							</button>
							{active === i ? (
								<div
									role="tooltip"
									className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
								>
									<p className="text-sm font-semibold tabular-nums">
										{s.value} · {pct}%
									</p>
									<p className="flex items-center gap-1.5 text-muted-foreground">
										<span
											className="h-0.5 w-3 rounded-full"
											style={{ background: s.color }}
										/>
										{s.name}
									</p>
								</div>
							) : null}
						</li>
					);
				})}
			</ul>
			<ul
				className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
				aria-label="Legend"
			>
				{visible.map((s) => (
					<li key={s.name} className="flex items-center gap-1.5">
						<span
							className="size-2.5 rounded-sm"
							style={{ background: s.color }}
							aria-hidden="true"
						/>
						{s.name}
					</li>
				))}
			</ul>
		</div>
	);
}
