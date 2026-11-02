import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { m } from "#/paraglide/messages.js";

type FieldMeta = {
	isTouched: boolean;
	errors: ReadonlyArray<{ message?: string } | string | undefined | null>;
};

// Messages for a TanStack Form field, shown once the user has interacted with it
export function fieldErrors(meta: FieldMeta) {
	if (!meta.isTouched) return [];
	return [
		...new Set(
			meta.errors
				.map((e) => (typeof e === "string" ? e : e?.message))
				.filter((m): m is string => Boolean(m)),
		),
	];
}

export function FieldError({ id, meta }: { id: string; meta: FieldMeta }) {
	const messages = fieldErrors(meta);
	if (!messages.length) return null;
	return (
		<p id={id} role="alert" className="text-sm font-medium text-destructive">
			{messages[0]}
		</p>
	);
}

export function PasswordInput(
	props: Omit<ComponentProps<typeof Input>, "type">,
) {
	const [visible, setVisible] = useState(false);
	return (
		<div className="relative">
			<Input
				{...props}
				type={visible ? "text" : "password"}
				className="pr-10"
			/>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
				onClick={() => setVisible((v) => !v)}
				aria-label={
					visible ? m.common_hide_password() : m.common_show_password()
				}
				aria-pressed={visible}
			>
				{visible ? <EyeOff /> : <Eye />}
			</Button>
		</div>
	);
}

export function FormAlert({
	message,
	variant = "destructive",
}: {
	message: string | null;
	variant?: "destructive" | "success";
}) {
	if (!message) return null;
	return (
		<Alert
			variant={variant === "destructive" ? "destructive" : "default"}
			role={variant === "destructive" ? "alert" : "status"}
		>
			{variant === "destructive" ? <AlertCircle /> : <CheckCircle2 />}
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}

export function Divider({ label }: { label: string }) {
	return (
		<div className="relative text-center text-xs uppercase">
			<span
				className="absolute inset-x-0 top-1/2 border-t"
				aria-hidden="true"
			/>
			<span className="relative bg-card px-2 text-muted-foreground">
				{label}
			</span>
		</div>
	);
}
