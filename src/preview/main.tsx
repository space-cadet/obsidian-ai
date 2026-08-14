import React from "react";
import { createRoot } from "react-dom/client";
import PreviewApp from "./PreviewApp";
import "./preview.css";
import "../../styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Preview root element not found");
createRoot(root).render(<PreviewApp />);
