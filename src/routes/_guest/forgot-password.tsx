import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { ForgotPasswordForm } from "#/components/Auth/ForgotPasswordForm";

export const Route = createFileRoute("/_guest/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	return (
		<AuthCard
			title="Forgot your password?"
			description="Enter your email and we'll send you a reset link"
			footer={
				<Link to="/login" className="underline-offset-4 hover:underline">
					Back to sign in
				</Link>
			}
		>
			<ForgotPasswordForm />
		</AuthCard>
	);
}
