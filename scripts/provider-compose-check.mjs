import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Bun is the repository's pinned script runtime. Parsing resolves YAML merge
// aliases, so these checks verify what each container actually inherits.
const source = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8");
const expected = {
  INVOICE_NINJA_BASE_URL: "",
  INVOICE_NINJA_API_TOKEN: "",
  INVOICE_NINJA_WEBHOOK_SECRET: "",
  INVOICE_NINJA_WEBHOOK_SECRET_PREVIOUS: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_ACCOUNT_ID: "",
  STRIPE_MODE: "test",
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_WEBHOOK_SECRET_PREVIOUS: "",
  MEDUSA_BASE_URL: "",
  MEDUSA_SECRET_API_KEY: "",
  MEDUSA_BRIDGE_WEBHOOK_SECRET: "",
  MEDUSA_BRIDGE_WEBHOOK_SECRET_PREVIOUS: "",
};
function verify(yaml) {
  const compose = Bun.YAML.parse(yaml);
  for (const service of ["app", "worker"]) {
    const environment = compose.services[service].environment;
    for (const [key, fallback] of Object.entries(expected)) {
      assert.equal(environment[key], `\${${key}:-${fallback}}`, `${service} must inherit ${key}`);
    }
  }
}
verify(source);
// Regression checks for the integration's accidental dedent and for an omitted
// provider setting. These operate on strings, never deployment files or secrets.
assert.throws(() => verify(source.replace("  MEDUSA_BASE_URL:", "MEDUSA_BASE_URL:")));
assert.throws(() => verify(source.replace(/^  STRIPE_SECRET_KEY:.*\n/m, "")));
console.info("Compose parses and both app/worker inherit all optional provider settings; regression probes passed.");
