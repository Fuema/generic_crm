import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { SignInForm } from "#/components/Auth/SignInForm";
import { getSocialProviders, safeRedirect } from "#/lib/auth-providers";

const NOTICES: Record<string, string> = {
	"password-reset":
		"Your password was changed. Sign in with your new password.",
	"signed-out": "You've been signed out.",
};

export const Route = createFileRoute("/_guest/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { redirect?: string; notice?: string; error?: string } => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
		notice: typeof search.notice === "string" ? search.notice : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	loader: () => getSocialProviders(),
	component: LoginPage,
});

function LoginPage() {
	const providers = Route.useLoaderData();
	const { redirect, notice, error } = Route.useSearch();

	return (
		<AuthCard
			title="Welcome back"
			description="Sign in to your account"
			footer={
				<p>
					No account yet?{" "}
					<Link
						to="/signup"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						Sign up
					</Link>
				</p>
			}
		>
			{error ? (
				<p role="alert" className="text-center text-sm text-destructive">
					Social sign-in didn't complete. Please try again.
				</p>
			) : null}
			<SignInForm
				providers={providers}
				redirectTo={safeRedirect(redirect)}
				notice={notice ? NOTICES[notice] : undefined}
			/>
		</AuthCard>
	);
}
