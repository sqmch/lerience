import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "@fontsource-variable/jetbrains-mono";
/* One entry: the design layer declares its own cascade order, which a JS import
   cannot do (see the comment at the top of index.css). */
import "./design/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root === null) throw new Error("renderer html is missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
