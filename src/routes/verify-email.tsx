import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { AuthCard } from "#/components/Auth/AuthCard";
import { FormAlert } from "#/components/Auth/FormParts";
import { buttonVariants } from "#/components/ui/button";

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
			<AuthCard title="Link expired">
				<FormAlert message="This verification link is invalid or has expired. Sign in to get a new one." />
				<Link to="/login" className={buttonVariants({ className: "w-full" })}>
					Go to sign in
				</Link>
			</AuthCard>
		);
	}

	return (
		<AuthCard title="Email verified">
			<CheckCircle2
				className="mx-auto size-12 text-emerald-600"
				aria-hidden="true"
			/>
			<p className="text-center">Your account is active. You're signed in.</p>
			<Link to="/dashboard" className={buttonVariants({ className: "w-full" })}>
				Continue to your dashboard
			</Link>
		</AuthCard>
	);
}
