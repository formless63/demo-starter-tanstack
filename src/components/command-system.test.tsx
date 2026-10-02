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
import { CommandPalette } from "./command-system";

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
		const input = await screen.findByRole("textbox", {
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
});
