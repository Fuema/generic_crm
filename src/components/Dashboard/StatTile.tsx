import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "#/components/ui/card";

const compact = new Intl.NumberFormat("en", {
	notation: "compact",
	maximumFractionDigits: 1,
});

// 1,284 / 12.9K / 4.2M
export function formatCount(n: number) {
	return n < 10_000 ? n.toLocaleString("en") : compact.format(n);
}

export type Delta = {
	// Signed text, e.g. "+25%" or "−3"
	value: string;
	period: string;
	direction: "up" | "down" | "flat";
	// Whether this direction is good news (sets the color; icon + sign carry it too)
	good: boolean;
};

function DeltaLine({ delta }: { delta: Delta }) {
	const Icon =
		delta.direction === "up"
			? ArrowUp
			: delta.direction === "down"
				? ArrowDown
				: Minus;
	const color =
		delta.direction === "flat"
			? "var(--color-muted-foreground)"
			: delta.good
				? "var(--viz-good-text)"
				: "var(--viz-bad-text)";
	return (
		<p className="flex items-center gap-1 text-sm">
			<span
				className="inline-flex items-center gap-0.5 font-medium"
				style={{ color }}
			>
				<Icon className="size-3.5" aria-hidden="true" />
				{delta.value}
			</span>
			<span className="text-muted-foreground">{delta.period}</span>
		</p>
	);
}

// History in the de-emphasis gray, the current period marked in the accent
function Sparkline({ points }: { points: number[] }) {
	if (points.length < 2) return null;
	const w = 120;
	const h = 32;
	const pad = 5; // room for the end marker and its ring
	const max = Math.max(...points, 1);
	const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
	const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
	const path = points
		.map(
			(v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
		)
		.join(" ");
	const last = points.length - 1;
	return (
		<svg
			viewBox={`0 0 ${w} ${h}`}
			className="h-8 w-28 shrink-0"
			aria-hidden="true"
		>
			<path
				d={path}
				fill="none"
				stroke="var(--viz-deemph)"
				strokeWidth={2}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			<circle
				cx={x(last)}
				cy={y(points[last])}
				r={4}
				fill="var(--viz-1)"
				stroke="var(--color-card)"
				strokeWidth={2}
			/>
		</svg>
	);
}

export function StatTile({
	label,
	value,
	delta,
	caption,
	trend,
	children,
}: {
	label: string;
	value: string;
	delta?: Delta;
	caption?: ReactNode;
	trend?: number[];
	children?: ReactNode;
}) {
	return (
		<Card className="gap-0 py-5">
			<CardContent className="space-y-2">
				<p className="text-sm text-muted-foreground">{label}</p>
				<div className="flex items-end justify-between gap-3">
					<p className="text-3xl font-semibold tracking-tight">{value}</p>
					{trend ? <Sparkline points={trend} /> : null}
				</div>
				{delta ? <DeltaLine delta={delta} /> : null}
				{caption ? (
					<p className="text-sm text-muted-foreground">{caption}</p>
				) : null}
				{children}
			</CardContent>
		</Card>
	);
}

// Single ratio against a whole: blue fill on a lighter step of the same blue.
// Purely visual: the tile's value and caption state the same ratio in text.
export function Meter({ value, max }: { value: number; max: number }) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return (
		<div
			aria-hidden="true"
			className="h-2 overflow-hidden rounded-full"
			style={{ background: "var(--viz-track)" }}
		>
			<div
				className="h-full rounded-full"
				style={{ width: `${pct}%`, background: "var(--viz-1)" }}
			/>
		</div>
	);
}
