import { Check, X } from "lucide-react";
import { passwordRules } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

const LEVELS = [
	{
		id: "very-weak",
		label: m.auth_strength_very_weak,
		className: "bg-destructive",
	},
	{ id: "weak", label: m.auth_strength_weak, className: "bg-destructive" },
	{ id: "fair", label: m.auth_strength_fair, className: "bg-amber-500" },
	{ id: "good", label: m.auth_strength_good, className: "bg-amber-500" },
	{ id: "strong", label: m.auth_strength_strong, className: "bg-emerald-500" },
	{
		id: "very-strong",
		label: m.auth_strength_very_strong,
		className: "bg-emerald-600",
	},
];

// Live checklist of the password policy plus a strength bar
export function PasswordStrength({ password }: { password: string }) {
	const results = passwordRules.map((rule) => ({
		...rule,
		passed: rule.test(password),
	}));
	const passed = results.filter((r) => r.passed).length;
	// Reward extra length beyond the minimum
	const score = Math.min(
		passed + (password.length >= 16 && passed === results.length ? 1 : 0),
		LEVELS.length - 1,
	);
	const level = LEVELS[score];

	if (!password) return null;

	return (
		<div className="space-y-2" aria-live="polite">
			<div className="flex items-center gap-2">
				<div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
					{LEVELS.slice(1).map((l, i) => (
						<span
							key={l.id}
							className={`flex-1 rounded-full ${i < score ? level.className : "bg-muted"}`}
						/>
					))}
				</div>
				<span className="text-xs font-medium text-muted-foreground">
					{level.label()}
				</span>
			</div>
			<ul className="grid gap-1 text-xs sm:grid-cols-2">
				{results.map((r) => (
					<li
						key={r.id}
						className={`flex items-center gap-1.5 ${r.passed ? "text-emerald-600" : "text-muted-foreground"}`}
					>
						{r.passed ? (
							<Check className="size-3.5" />
						) : (
							<X className="size-3.5" />
						)}
						<span>
							{r.label()}
							<span className="sr-only">
								{" "}
								{r.passed ? m.auth_strength_met() : m.auth_strength_not_met()}
							</span>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
