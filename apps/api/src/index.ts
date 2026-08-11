import type { HealthResponse } from "@playable-factory/shared";
import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { adminRouter } from "./routes/admin-route.js";
import { authRouter } from "./routes/auth-route.js";
import { chatRouter } from "./routes/chat-route.js";
import { searchRouter } from "./routes/search-route.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
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

app.listen(env.port, () => {
  console.log(
    `API listening on http://localhost:${env.port}`,
  );
});