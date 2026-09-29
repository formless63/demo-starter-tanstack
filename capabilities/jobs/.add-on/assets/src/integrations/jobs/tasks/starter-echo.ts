import { z } from "zod";

export const starterEchoPayload = z.object({
	message: z.string().trim().min(1).max(1_000),
});

export async function handleStarterEcho(
	payload: z.output<typeof starterEchoPayload>,
) {
	console.info(JSON.stringify({ event: "job.echo", message: payload.message }));
	return { echoed: payload.message };
}
