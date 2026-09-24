import { IconFolder, IconLogout, IconSparkles } from "@tabler/icons-react";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { getCurrentUser } from "#/features/projects/projects.functions";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/app")({
	beforeLoad: async () => {
		try {
			return { user: await getCurrentUser() };
		} catch {
			throw redirect({ to: "/" });
		}
	},
	component: AppShell,
});

function AppShell() {
	const { user } = Route.useRouteContext();
	return (
		<div className="min-h-screen bg-muted/30 text-foreground">
			<header className="border-b bg-background">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
					<Link
						to="/app/projects"
						className="flex items-center gap-2 font-semibold"
					>
						<IconSparkles size={20} /> Launchpad
					</Link>
					<div className="flex items-center gap-3">
						<span className="hidden text-sm text-muted-foreground sm:block">
							{user.email}
						</span>
						<button
							type="button"
							aria-label="Sign out"
							className="rounded-lg border p-2"
							onClick={async () => {
								await authClient.signOut();
								window.location.href = "/";
							}}
						>
							<IconLogout size={18} />
						</button>
					</div>
				</div>
			</header>
			<div className="mx-auto grid max-w-6xl md:grid-cols-[190px_1fr]">
				<aside className="border-r p-4 max-md:border-b">
					<Link
						to="/app/projects"
						className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium"
					>
						<IconFolder size={18} /> Projects
					</Link>
				</aside>
				<main className="min-w-0 p-5 md:p-8">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
