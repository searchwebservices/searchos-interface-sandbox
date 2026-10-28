import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/searchos-theme.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
