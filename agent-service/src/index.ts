// src/index.ts
import express from "express";
import mongoose from "mongoose";
import logger from "./services/logger";
import { errorHandler } from "./middleware/error";
import collectionRoutes from "./api/routes/collection.routes";
import config from "./config";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api", collectionRoutes);

// Error handling
app.use(errorHandler);

// Connect to MongoDB
mongoose
  .connect(config.MONGODB_URI)
  .then(() => {
    logger.info("Connected to MongoDB");

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection:", error);
  process.exit(1);
});
