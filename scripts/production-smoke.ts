// Execute shared operational bundles from the same production image as app/worker.
import { spawn } from "node:child_process";

for (const bundle of ["jobs-doctor", "jobs-smoke", "webhooks-smoke", "ai-reference-smoke"]) {
 const child = spawn("docker", ["compose", "run", "--rm", "worker", "node", "--unhandled-rejections=strict", `.output/${bundle}.mjs`], { stdio: "inherit" });
 const code = await new Promise<number>((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", value => resolve(value ?? 1));
 });
 if (code !== 0) throw new Error(`Production smoke failed: ${bundle} (${code})`);
}
