---
name: release-verification
description: Explicitly preparing a release or verifying full repository readiness.
---
# release verification
Inspect the relevant implementation and context first. Follow framework-native patterns, make one coherent change, run the narrow affected checks, fix caused failures, then rerun them. Update documentation and generated artifacts when behavior or commands change. Never expose secrets or touch production.
