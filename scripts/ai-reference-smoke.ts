// Explicit server-side demonstration, always local: no real credentials/providers.
import { createApplicationAi } from "../src/lib/ai.server";
import { runAiFixture } from "./ai-fixture";
await runAiFixture(createApplicationAi);
