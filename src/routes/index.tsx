import {
	IconBrandGithub,
	IconDatabase,
	IconLock,
	IconSparkles,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { authClient } from "#/lib/auth-client";
import { safeInternalRedirect } from "#/lib/safe-redirect";

export const Route = createFileRoute("/")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	component: Landing,
});

function Landing() {
	const { data: session, isPending } = authClient.useSession();
	const { redirect } = Route.useSearch();
	const callbackURL = safeInternalRedirect(redirect);
	const signIn = (provider: "github" | "oidc") =>
		provider === "github"
			? authClient.signIn.social({
					provider: "github",
					callbackURL,
				})
			: authClient.signIn.social({
					provider: "oidc",
					callbackURL,
				});
	return (
		<main className="min-h-screen bg-background text-foreground">
			<nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
				<div className="flex items-center gap-2 font-semibold">
					<IconSparkles size={20} /> Launchpad
				</div>
				<ThemeButton />
			</nav>
			<section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-32">
				<div>
					<p className="mb-4 text-sm font-medium text-primary">
						A production-minded TanStack foundation
					</p>
					<h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
						Start with the important parts already connected.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground">
						Authentication, PostgreSQL, migrations, protected routes, and a real
						Projects workflow—without hiding TanStack Start behind another
						server framework.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						{isPending ? (
							<span>Restoring session…</span>
						) : session ? (
							<Link
								className="rounded-lg bg-primary px-5 py-3 text-primary-foreground"
								to="/app/projects"
							>
								Open your projects
							</Link>
						) : (
							<>
								<button
									type="button"
									className="flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-primary-foreground"
									onClick={() => void signIn("github")}
								>
									<IconBrandGithub size={19} /> Continue with GitHub
								</button>
								<button
									type="button"
									className="rounded-lg border px-5 py-3"
									onClick={() => void signIn("oidc")}
								>
									Continue with OIDC
								</button>
							</>
						)}
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{[
						{
							Icon: IconLock,
							title: "Secure by default",
							text: "OAuth-only sessions and owner-scoped mutations.",
						},
						{
							Icon: IconDatabase,
							title: "Real persistence",
							text: "PostgreSQL and generated Drizzle migrations.",
						},
					].map(({ Icon, title, text }) => (
						<article
							className="rounded-2xl border bg-card p-6 shadow-sm"
							key={title}
						>
							<Icon className="mb-10 text-primary" />
							<h2 className="font-semibold">{title}</h2>
							<p className="mt-2 text-sm text-muted-foreground">{text}</p>
						</article>
					))}
				</div>
			</section>
		</main>
	);
}

function ThemeButton() {
	return (
		<button
			type="button"
			className="rounded-lg border px-3 py-2 text-sm"
			onClick={() => {
				const current = localStorage.theme || "system";
				const next =
					current === "system"
						? "light"
						: current === "light"
							? "dark"
							: "system";
				localStorage.theme = next;
				const dark =
					next === "dark" ||
					(next === "system" &&
						matchMedia("(prefers-color-scheme: dark)").matches);
				document.documentElement.classList.toggle("dark", dark);
			}}
		>
			Theme: light / dark / system
		</button>
	);
}
