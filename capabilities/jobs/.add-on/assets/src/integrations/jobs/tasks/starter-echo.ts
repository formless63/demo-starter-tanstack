import { z } from "zod";

export const starterEchoPayload = z.object({
	message: z.string().trim().min(1).max(1_000),
});

export async function handleStarterEcho(
	payload: z.output<typeof starterEchoPayload>,
) {
	return { echoed: payload.message };
}
