import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { FormAlert } from "#/components/Auth/FormParts";
import { ResetPasswordForm } from "#/components/Auth/ResetPasswordForm";
import { buttonVariants } from "#/components/ui/button";

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
			title="Choose a new password"
			description="Make it strong and different from your old one"
		>
			{token && !error ? (
				<ResetPasswordForm token={token} />
			) : (
				<div className="space-y-4">
					<FormAlert message="This reset link is invalid or has expired." />
					<Link
						to="/forgot-password"
						className={buttonVariants({ className: "w-full" })}
					>
						Request a new link
					</Link>
				</div>
			)}
		</AuthCard>
	);
}
