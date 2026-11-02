import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { TwoFactorForm } from "#/components/Auth/TwoFactorForm";

export const Route = createFileRoute("/_guest/two-factor")({
	component: TwoFactorPage,
});

function TwoFactorPage() {
	return (
		<AuthCard
			title="Two-step verification"
			description="Confirm it's you to finish signing in"
			footer={
				<Link to="/login" className="underline-offset-4 hover:underline">
					Back to sign in
				</Link>
			}
		>
			<TwoFactorForm />
		</AuthCard>
	);
}
