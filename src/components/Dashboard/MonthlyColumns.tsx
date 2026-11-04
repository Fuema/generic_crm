import { useState } from "react";
import { getLocale } from "#/paraglide/runtime.js";

// Clean axis ticks: 0, then a 1/2/5 × 10ⁿ step that covers the max in ≤ 4 steps
function ticksFor(max: number) {
	if (max <= 0) return [0, 1];
	const raw = max / 4;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step =
		[1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
	const top = Math.ceil(max / step) * step;
	return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function monthLabel(month: string, style: "short" | "long") {
	const [y, m] = month.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(getLocale(), {
		month: style,
		year: style === "long" ? "numeric" : undefined,
		timeZone: "UTC",
	});
}

// Single-series column chart. Each column is its own hover/focus target; the
// latest month's value is labeled on its cap, the rest live in the tooltip and
// the table view.
export function MonthlyColumns({
	data,
	label,
	itemLabel,
}: {
	data: { month: string; count: number }[];
	label: string;
	// Spoken label of one column, e.g. "March 2026: 4 new contacts"
	itemLabel: (month: string, count: number) => string;
}) {
	const [active, setActive] = useState<number | null>(null);
	const ticks = ticksFor(Math.max(...data.map((d) => d.count)));
	const top = ticks[ticks.length - 1];
	const last = data.length - 1;

	return (
		<div className="flex gap-2">
			{/* Y axis */}
			<div
				className="relative h-48 w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
				aria-hidden="true"
			>
				{ticks.map((t) => (
					<span
						key={t}
						className="absolute right-0 -translate-y-1/2"
						style={{ bottom: `${(t / top) * 100}%` }}
					>
						{t}
					</span>
				))}
			</div>
			<div className="min-w-0 flex-1">
				<div className="relative h-48">
					{/* Hairline gridlines; the zero line is the baseline */}
					{ticks.map((t) => (
						<div
							key={t}
							className="absolute inset-x-0 h-px"
							style={{
								bottom: `${(t / top) * 100}%`,
								background: t === 0 ? "var(--viz-axis)" : "var(--viz-grid)",
							}}
							aria-hidden="true"
						/>
					))}
					<ul className="relative flex h-full items-end" aria-label={label}>
						{data.map((d, i) => {
							const height = (d.count / top) * 100;
							const columnLabel = itemLabel(
								monthLabel(d.month, "long"),
								d.count,
							);
							return (
								<li key={d.month} className="relative flex h-full flex-1">
									{/* The whole band is the hit target, not just the painted column */}
									<button
										type="button"
										aria-label={columnLabel}
										className="relative flex h-full w-full cursor-default items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onPointerEnter={() => setActive(i)}
										onPointerLeave={() => setActive(null)}
										onFocus={() => setActive(i)}
										onBlur={() => setActive(null)}
									>
										{i === last && d.count > 0 ? (
											<span
												className="absolute left-1/2 -translate-x-1/2 text-xs font-medium tabular-nums"
												style={{ bottom: `calc(${height}% + 4px)` }}
												aria-hidden="true"
											>
												{d.count}
											</span>
										) : null}
										<span
											className="block w-full max-w-6 rounded-t transition-opacity"
											style={{
												height: d.count > 0 ? `${height}%` : 0,
												background: "var(--viz-1)",
												opacity: active === null || active === i ? 1 : 0.55,
											}}
										/>
									</button>
									{active === i ? (
										<div
											role="tooltip"
											className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
											style={{ bottom: `calc(${height}% + 8px)` }}
										>
											<p className="text-sm font-semibold tabular-nums">
												{d.count}
											</p>
											<p className="text-muted-foreground">
												{monthLabel(d.month, "long")}
											</p>
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				</div>
				{/* X axis: every other month on narrow screens */}
				<div
					className="mt-1 flex text-xs text-muted-foreground"
					aria-hidden="true"
				>
					{data.map((d, i) => (
						<span
							key={d.month}
							className={`flex-1 text-center ${i % 2 === 1 ? "hidden sm:block" : ""}`}
						>
							{monthLabel(d.month, "short")}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
