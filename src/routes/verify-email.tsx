import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { AuthCard } from "#/components/Auth/AuthCard";
import { FormAlert } from "#/components/Auth/FormParts";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages.js";

// Landing page for the email verification link. Better Auth verifies the token,
// signs the user in, then redirects here (with ?error=... if the link was bad).
export const Route = createFileRoute("/verify-email")({
	validateSearch: (search: Record<string, unknown>): { error?: string } => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	const { error } = Route.useSearch();

	if (error) {
		return (
			<AuthCard title={m.auth_verify_expired_title()}>
				<FormAlert message={m.auth_verify_expired()} />
				<Link to="/login" className={buttonVariants({ className: "w-full" })}>
					{m.common_go_to_sign_in()}
				</Link>
			</AuthCard>
		);
	}

	return (
		<AuthCard title={m.auth_verify_done_title()}>
			<CheckCircle2
				className="mx-auto size-12 text-emerald-600"
				aria-hidden="true"
			/>
			<p className="text-center">{m.auth_verify_done()}</p>
			<Link to="/dashboard" className={buttonVariants({ className: "w-full" })}>
				{m.auth_verify_continue()}
			</Link>
		</AuthCard>
	);
}
