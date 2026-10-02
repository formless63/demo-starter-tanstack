import { hydrateRoot } from "react-dom/client";
import { UnicodeExample } from "./unicode-example";
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
hydrateRoot(root, <UnicodeExample />);
