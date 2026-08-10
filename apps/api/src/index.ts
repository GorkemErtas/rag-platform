import express from "express";
import type { HealthResponse } from "@playable-factory/shared";

import { chatRouter } from "./routes/chat-route.js";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  const response: HealthResponse = {
    status: "ok",
    service: "api",
  };

  res.json(response);
});

app.use("/api/chat", chatRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});