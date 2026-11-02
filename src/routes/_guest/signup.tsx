import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { SignUpForm } from "#/components/Auth/SignUpForm";
import { getSocialProviders } from "#/lib/auth-providers";

export const Route = createFileRoute("/_guest/signup")({
	loader: () => getSocialProviders(),
	component: SignUpPage,
});

function SignUpPage() {
	const providers = Route.useLoaderData();

	return (
		<AuthCard
			title="Create an account"
			description="Start in less than a minute"
			footer={
				<p>
					Already have an account?{" "}
					<Link
						to="/login"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						Sign in
					</Link>
				</p>
			}
		>
			<SignUpForm providers={providers} />
		</AuthCard>
	);
}
