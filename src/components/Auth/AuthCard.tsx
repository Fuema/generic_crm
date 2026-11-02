import type { ReactNode } from "react";
import { AppLogo } from "#/components/Layout/AppSidebar";
import { ThemeToggle } from "#/components/Layout/ThemeToggle";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

export function AuthCard({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="relative flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
			<div className="absolute top-3 right-3">
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<AppLogo className="mx-auto mb-2 size-10" />
					<CardTitle className="text-2xl">{title}</CardTitle>
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-6">{children}</CardContent>
				{footer ? (
					<CardFooter className="justify-center text-sm text-muted-foreground">
						{footer}
					</CardFooter>
				) : null}
			</Card>
		</div>
	);
}
