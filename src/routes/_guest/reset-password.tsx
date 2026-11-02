import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { FormAlert } from "#/components/Auth/FormParts";
import { ResetPasswordForm } from "#/components/Auth/ResetPasswordForm";
import { buttonVariants } from "#/components/ui/button";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_guest/reset-password")({
	// Better Auth sends users here with ?token=... (or ?error=INVALID_TOKEN for a bad link)
	validateSearch: (
		search: Record<string, unknown>,
	): { token?: string; error?: string } => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();

	return (
		<AuthCard
			title={m.auth_reset_title()}
			description={m.auth_reset_description()}
		>
			{token && !error ? (
				<ResetPasswordForm token={token} />
			) : (
				<div className="space-y-4">
					<FormAlert message={m.auth_reset_invalid_link()} />
					<Link
						to="/forgot-password"
						className={buttonVariants({ className: "w-full" })}
					>
						{m.auth_reset_request_new()}
					</Link>
				</div>
			)}
		</AuthCard>
	);
}
