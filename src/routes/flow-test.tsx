import { createFileRoute } from "@tanstack/react-router";
import { FlowExample } from "../../scripts/flow-canvas-example";
export const Route = createFileRoute("/flow-test")({ component: FlowExample });
