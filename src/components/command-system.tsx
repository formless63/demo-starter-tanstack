import { Dialog } from "@base-ui/react/dialog";
import { type RegisterableHotkey, useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useRef, useState } from "react";

type Command = { id: string; label: string; execute: () => void };

export function CommandPalette({ commands }: { commands: readonly Command[] }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const filtered = commands.filter((command) =>
		command.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
	);
	useHotkey("Mod+K" as RegisterableHotkey, () => setOpen(true), {
		ignoreInputs: true,
	});
	useEffect(() => {
		if (!open) return;
		const id = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [open]);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger className="sr-only">Open command menu</Dialog.Trigger>
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
							filtered[active].execute();
							setOpen(false);
						}
					}}
				>
					<Dialog.Title className="sr-only">Command menu</Dialog.Title>
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
					<div role="listbox" aria-label="Command menu" className="p-2">
						{filtered.map((command, index) => (
							<button
								key={command.id}
								type="button"
								role="option"
								aria-selected={index === active}
								className="block w-full rounded-md px-3 py-2 text-left aria-selected:bg-accent"
								onMouseEnter={() => setActive(index)}
								onClick={() => {
									command.execute();
									setOpen(false);
								}}
							>
								{command.label}
							</button>
						))}
						{filtered.length === 0 && (
							<p className="p-3 text-sm text-muted-foreground">
								No commands found.
							</p>
						)}
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
