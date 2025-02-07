import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from "@jest/globals";
import request from "supertest";
import express from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import statusRoutes from "../routes/status.routes";
import { errorHandler } from "../middleware/error.middleware";
import { PipelineStatus } from "../types";

describe("Status API", () => {
  let app: express.Application;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    // Ensure no existing connections
    await mongoose.disconnect();

    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // Connect with specific options to avoid warnings
    await mongoose.connect(uri, {
      autoCreate: true,
      autoIndex: true,
    });

    app = express();
    app.use(express.json());
    app.use("/api", statusRoutes);
    app.use(errorHandler);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongod.stop();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.collection("pipeline_status").deleteMany({});
    }
  });

  it("should return 404 when no status exists", async () => {
    const response = await request(app).get("/api/pipeline/status");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "STATUS_NOT_FOUND",
        message: "Pipeline status not found",
      },
    });
  });

  it("should return pipeline status when it exists", async () => {
    const mockStatus: PipelineStatus = {
      currentBatch: {
        id: "batch_123",
        startTime: new Date(),
        status: "processing",
      },
      statistics: {
        totalBatchesProcessed: 30,
        totalTradesCollected: 1478,
        totalTradesStored: 108,
        totalTradesEnriched: 54,
        totalEventsCollected: 1380,
      },
      lastUpdated: new Date(),
    };

    await mongoose.connection
      .collection("pipeline_status")
      .insertOne(mockStatus);

    const response = await request(app).get("/api/pipeline/status");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      currentBatch: {
        id: "batch_123",
        status: "processing",
      },
      statistics: {
        totalBatchesProcessed: 30,
        totalTradesCollected: 1478,
        totalTradesStored: 108,
        totalTradesEnriched: 54,
        totalEventsCollected: 1380,
      },
    });
  });

  it("should handle database errors gracefully", async () => {
    // Instead of disconnecting, we can mock a DB error
    const originalCollection = mongoose.connection.collection;
    mongoose.connection.collection = jest.fn().mockImplementation(() => {
      throw new Error("Simulated DB Error");
    }) as typeof mongoose.connection.collection;

    const response = await request(app).get("/api/pipeline/status");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch pipeline status",
      },
    });

    // Restore original collection method
    mongoose.connection.collection = originalCollection;
  });
});
