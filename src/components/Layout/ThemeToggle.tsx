import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { applyTheme, readTheme, saveTheme, type Theme } from "#/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
	{ value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle() {
	// Starts as "system" on the server; the real choice is read after hydration
	const [theme, setTheme] = useState<Theme>("system");

	useEffect(() => {
		setTheme(readTheme());
	}, []);

	// While on "system", follow OS changes live
	useEffect(() => {
		if (theme !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme]);

	const choose = (next: Theme) => {
		setTheme(next);
		saveTheme(next);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Change theme">
					<Sun className="dark:hidden" />
					<Moon className="hidden dark:block" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{OPTIONS.map(({ value, label, Icon }) => (
					<DropdownMenuItem key={value} onSelect={() => choose(value)}>
						<Icon />
						{label}
						{theme === value ? (
							<Check className="ml-auto" aria-label="selected" />
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
