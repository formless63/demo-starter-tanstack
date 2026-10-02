// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, createCommandRegistry } from "./command-system";

describe("reference command palette", () => {
	afterEach(() => cleanup());
	it("supports Mod+K, keyboard execution, and focus return", async () => {
		const execute = vi.fn();
		render(
			<CommandPalette commands={[{ id: "one", label: "One", execute }]} />,
		);
		const trigger = screen.getByRole("button", { name: "Open command menu" });
		trigger.focus();
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		const input = await screen.findByRole("combobox", {
			name: "Search commands",
		});
		expect(document.activeElement).toBe(input);
		fireEvent.keyDown(input, { key: "Enter" });
		expect(execute).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("suppresses Mod+K in editable controls", () => {
		render(
			<>
				<input aria-label="Editor" />
				<CommandPalette commands={[]} />
			</>,
		);
		const editor = screen.getByRole("textbox", { name: "Editor" });
		editor.focus();
		fireEvent.keyDown(editor, { key: "k", ctrlKey: true });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders a deterministic SSR shell without browser globals", () => {
		const html = renderToString(<CommandPalette commands={[]} />);
		expect(html).toContain("Open command menu");
		expect(html).not.toContain('role="dialog"');
	});

	it("tracks a focused second option instead of executing the first", async () => {
		const first = vi.fn();
		const second = vi.fn();
		render(
			<CommandPalette
				commands={[
					{ id: "one", label: "One", execute: first },
					{ id: "two", label: "Two", execute: second },
				]}
			/>,
		);
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		const input = await screen.findByRole("combobox");
		const options = screen.getAllByRole("option");
		const secondOption = options.at(1);
		if (!secondOption) throw new Error("second option missing");
		secondOption.focus();
		await waitFor(() =>
			expect(input.getAttribute("aria-activedescendant")).toBe("command-two"),
		);
		fireEvent.keyDown(secondOption, { key: "Enter" });
		fireEvent.click(secondOption);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("unregisters commands without retaining stale entries", () => {
		const registry = createCommandRegistry();
		const dispose = registry.register({
			id: "one",
			label: "One",
			execute: vi.fn(),
		});
		expect(registry.list()).toHaveLength(1);
		dispose();
		expect(registry.list()).toHaveLength(0);
	});

	it("latches duplicate clicks while async work is pending and reports rejection", async () => {
		let reject!: (error: Error) => void;
		const execute = vi.fn(
			() =>
				new Promise<void>((_, fail) => {
					reject = fail;
				}),
		);
		render(
			<CommandPalette commands={[{ id: "slow", label: "Slow", execute }]} />,
		);
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		const option = await screen.findByRole("option", { name: "Slow" });
		fireEvent.click(option);
		fireEvent.click(option);
		expect(execute).toHaveBeenCalledTimes(1);
		reject(new Error("failed"));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain("failed"),
		);
	});

	it("clears execution ownership after success so reopening can run again", async () => {
		const execute = vi.fn(async () => {});
		render(
			<CommandPalette commands={[{ id: "again", label: "Again", execute }]} />,
		);
		const trigger = screen.getByRole("button", { name: "Open command menu" });
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		fireEvent.click(await screen.findByRole("option", { name: "Again" }));
		await waitFor(() =>
			expect(document.querySelector('[role="dialog"]')).toBeNull(),
		);
		fireEvent.click(trigger);
		fireEvent.click(await screen.findByRole("option", { name: "Again" }));
		await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
	});
});
