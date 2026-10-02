import { Dialog } from "@base-ui/react/dialog";
import { type RegisterableHotkey, useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useMemo, useRef, useState } from "react";

export type AppCommand = {
	id: string;
	label: string;
	keywords?: readonly string[];
	shortcut?: string;
	group?: string;
	disabled?: boolean;
	execute: () => void | Promise<void>;
};

export type CommandPaletteProps = {
	commands: readonly AppCommand[];
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	shortcut?: string;
	label?: string;
};

export function CommandPalette({
	commands,
	open: controlledOpen,
	onOpenChange,
	shortcut = "Mod+K",
	label = "Command menu",
}: CommandPaletteProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = (value: boolean) => {
		if (controlledOpen === undefined) setUncontrolledOpen(value);
		onOpenChange?.(value);
	};

	useHotkey(shortcut as RegisterableHotkey, () => setOpen(true), {
		enabled: pending === null,
	});

	useEffect(() => {
		if (!open) {
			setQuery("");
			setActive(0);
			setError(null);
			return;
		}
		const id = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [open]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		return commands.filter((command) => {
			if (command.disabled) return false;
			if (!needle) return true;
			return [command.label, ...(command.keywords ?? [])].some((value) =>
				value.toLocaleLowerCase().includes(needle),
			);
		});
	}, [commands, query]);

	const run = async (command: AppCommand) => {
		if (pending !== null) return;
		setPending(command.id);
		setError(null);
		try {
			await command.execute();
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Command failed");
		} finally {
			setPending(null);
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
				<Dialog.Popup
					className="fixed left-1/2 top-1/4 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-background shadow-xl"
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActive((value) => Math.min(value + 1, filtered.length - 1));
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setActive((value) => Math.max(value - 1, 0));
						}
						if (event.key === "Enter" && filtered[active]) {
							event.preventDefault();
							void run(filtered[active]);
						}
					}}
				>
					<Dialog.Title className="sr-only">{label}</Dialog.Title>
					<Dialog.Description className="sr-only">
						Search and run an application command.
					</Dialog.Description>
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setActive(0);
						}}
						aria-label="Search commands"
						placeholder="Type a command…"
						className="w-full border-b bg-transparent px-4 py-3 outline-none"
					/>
					<div
						role="listbox"
						aria-label={label}
						className="max-h-80 overflow-auto p-2"
					>
						{filtered.map((command, index) => (
							<button
								type="button"
								role="option"
								aria-selected={index === active}
								key={command.id}
								disabled={pending !== null}
								onMouseEnter={() => setActive(index)}
								onClick={() => void run(command)}
								className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left aria-selected:bg-accent"
							>
								<span>
									{pending === command.id ? "Running…" : command.label}
								</span>
								{command.shortcut && (
									<kbd className="text-xs text-muted-foreground">
										{command.shortcut}
									</kbd>
								)}
							</button>
						))}
						{filtered.length === 0 && (
							<p className="p-3 text-sm text-muted-foreground">
								No commands found.
							</p>
						)}
					</div>
					{error && (
						<p
							role="alert"
							className="border-t px-4 py-2 text-sm text-destructive"
						>
							{error}
						</p>
					)}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
