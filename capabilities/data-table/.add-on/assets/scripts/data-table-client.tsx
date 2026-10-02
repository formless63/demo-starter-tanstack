import { hydrateRoot } from "react-dom/client";
import { Example } from "./data-table-example";
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
hydrateRoot(root, <Example />);
