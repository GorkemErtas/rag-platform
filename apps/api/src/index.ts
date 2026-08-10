import express from "express";
import type { HealthResponse } from "@playable-factory/shared";

import { authRouter } from "./routes/auth-route.js";
import { chatRouter } from "./routes/chat-route.js";
import { adminRouter } from "./routes/admin-route.js";
import { searchRouter } from "./routes/search-route.js";

import cors from "cors";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);

app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/admin", adminRouter);
app.use("/api/search", searchRouter);

app.get("/health", (_req, res) => {
  const response: HealthResponse = {
    status: "ok",
    service: "api",
  };

  res.json(response);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});