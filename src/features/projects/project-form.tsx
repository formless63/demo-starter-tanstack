import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import type { ProjectInput } from "./project-schema";

export function ProjectForm({
	initial,
	submitting,
	onSubmit,
	onCancel,
}: {
	initial?: ProjectInput;
	submitting?: boolean;
	onSubmit: (value: ProjectInput) => Promise<void>;
	onCancel?: () => void;
}) {
	const form = useForm({
		defaultValues: initial ?? { name: "", description: "" },
		onSubmit: async ({ value }) => onSubmit(value),
	});
	useEffect(
		() => form.reset(initial ?? { name: "", description: "" }),
		[initial, form],
	);
	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field
				name="name"
				validators={{
					onBlur: ({ value }) =>
						!value.trim()
							? "Name is required"
							: value.length > 100
								? "Use 100 characters or fewer"
								: undefined,
				}}
			>
				{(field) => (
					<label className="block text-sm font-medium">
						Name
						<input
							className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
						{field.state.meta.errors[0] && (
							<span className="mt-1 block text-sm text-destructive">
								{field.state.meta.errors[0]}
							</span>
						)}
					</label>
				)}
			</form.Field>
			<form.Field name="description">
				{(field) => (
					<label className="block text-sm font-medium">
						Description{" "}
						<span className="font-normal text-muted-foreground">
							(optional)
						</span>
						<textarea
							className="mt-1 min-h-24 w-full rounded-lg border bg-background px-3 py-2"
							value={field.state.value ?? ""}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</label>
				)}
			</form.Field>
			<div className="flex gap-2">
				<button
					className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
					disabled={submitting}
					type="submit"
				>
					{submitting ? "Saving…" : "Save project"}
				</button>
				{onCancel && (
					<button
						className="rounded-lg border px-4 py-2"
						type="button"
						onClick={onCancel}
					>
						Cancel
					</button>
				)}
			</div>
		</form>
	);
}
