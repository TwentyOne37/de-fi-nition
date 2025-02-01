// src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import config from "./config";
import logger from "./services/logger";
import { errorHandler } from "@/middleware/error";

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Global error handler
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    app.listen(config.PORT, () => {
      logger.info(`Server running on port ${config.PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
