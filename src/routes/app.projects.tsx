import { IconEdit, IconFolderPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ProjectForm } from "#/features/projects/project-form";
import type { ProjectInput } from "#/features/projects/project-schema";
import {
	createProject,
	deleteProject,
	listProjects,
	updateProject,
} from "#/features/projects/projects.functions";

export const Route = createFileRoute("/app/projects")({
	component: ProjectsPage,
});
const queryKey = ["projects"] as const;

function ProjectsPage() {
	const client = useQueryClient();
	const [editing, setEditing] = useState<
		Awaited<ReturnType<typeof listProjects>>[number] | null
	>(null);
	const [creating, setCreating] = useState(false);
	const projects = useQuery({ queryKey, queryFn: () => listProjects() });
	const save = useMutation({
		mutationFn: (input: ProjectInput) =>
			editing
				? updateProject({ data: { ...input, id: editing.id } })
				: createProject({ data: input }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey });
			toast.success(editing ? "Project updated" : "Project created");
			setCreating(false);
			setEditing(null);
		},
		onError: () => toast.error("Could not save the project"),
	});
	const remove = useMutation({
		mutationFn: (id: string) => deleteProject({ data: { id } }),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey });
			toast.success("Project deleted");
		},
		onError: () => toast.error("Could not delete the project"),
	});
	return (
		<section>
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
					<p className="mt-1 text-muted-foreground">
						Keep the work that matters in one place.
					</p>
				</div>
				<button
					type="button"
					className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
					onClick={() => {
						setEditing(null);
						setCreating(true);
					}}
				>
					<IconFolderPlus size={18} /> New project
				</button>
			</div>
			{(creating || editing) && (
				<div className="mb-6 rounded-xl border bg-card p-5">
					<h2 className="mb-4 font-semibold">
						{editing ? "Edit project" : "Create project"}
					</h2>
					<ProjectForm
						initial={
							editing
								? { name: editing.name, description: editing.description ?? "" }
								: undefined
						}
						submitting={save.isPending}
						onSubmit={async (value) => {
							await save.mutateAsync(value);
						}}
						onCancel={() => {
							setCreating(false);
							setEditing(null);
						}}
					/>
				</div>
			)}
			{projects.isPending ? (
				<div className="rounded-xl border p-8 text-center text-muted-foreground">
					Loading projects…
				</div>
			) : projects.isError ? (
				<div className="rounded-xl border border-destructive/30 p-8 text-center">
					<p>Projects could not be loaded.</p>
					<button
						type="button"
						className="mt-3 underline"
						onClick={() => void projects.refetch()}
					>
						Try again
					</button>
				</div>
			) : projects.data?.length === 0 ? (
				<div className="rounded-xl border border-dashed bg-card p-12 text-center">
					<IconFolderPlus className="mx-auto text-muted-foreground" />
					<h2 className="mt-4 font-semibold">No projects yet</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Create your first project to verify the full stack.
					</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					{projects.data?.map((project) => (
						<article
							className="rounded-xl border bg-card p-5 shadow-sm"
							key={project.id}
						>
							<div className="flex justify-between gap-3">
								<div>
									<h2 className="font-semibold">{project.name}</h2>
									<p className="mt-2 text-sm text-muted-foreground">
										{project.description || "No description"}
									</p>
								</div>
								<div className="flex gap-1">
									<button
										type="button"
										aria-label={`Edit ${project.name}`}
										className="rounded-md p-2 hover:bg-accent"
										onClick={() => {
											setCreating(false);
											setEditing(project);
										}}
									>
										<IconEdit size={17} />
									</button>
									<button
										type="button"
										aria-label={`Delete ${project.name}`}
										className="rounded-md p-2 text-destructive hover:bg-accent"
										onClick={() => {
											if (confirm(`Delete ${project.name}?`))
												remove.mutate(project.id);
										}}
									>
										<IconTrash size={17} />
									</button>
								</div>
							</div>
							<p className="mt-6 text-xs text-muted-foreground">
								Updated {new Date(project.updatedAt).toLocaleDateString()}
							</p>
						</article>
					))}
				</div>
			)}
		</section>
	);
}
