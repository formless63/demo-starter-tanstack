import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("../../../src/integrations/rich-text/editor.client", () => {
	throw new Error("Simulated dynamic chunk unavailable");
});

import { RichTextEditor } from "../../../src/integrations/rich-text/RichText";

test("failed client chunk leaves safe readable content and a non-busy failure status", async () => {
	const onChange = vi.fn();
	const { container } = render(
		<RichTextEditor
			label="Available content"
			value={{
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "Still readable <script>literal</script>" },
						],
					},
				],
			}}
			onChange={onChange}
		/>,
	);
	expect(await screen.findByText("Editor could not load.")).toBeDefined();
	expect(
		screen.getByRole("region", { name: "Available content" }).textContent,
	).toBe("Still readable <script>literal</script>");
	expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
	expect(container.querySelector("script,[contenteditable]")).toBeNull();
	expect(onChange).not.toHaveBeenCalled();
});
