import mongoose from "mongoose";
import logger from "./logger";
import config from "../config";

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  try {
    await mongoose.connect(config.MONGODB_URI);
    logger.info("Connected to MongoDB");

    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}
