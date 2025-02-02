import mongoose from "mongoose";
import { connectDatabase } from "../database";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  jest,
} from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import logger from "../logger";
import config from "../../config";

jest.mock("@/services/logger");

describe.skip("Database Service", () => {
  let mongoServer: MongoMemoryServer;
  const originalMongoURI = config.MONGODB_URI;

  beforeAll(async () => {
    await mongoose.disconnect();
    mongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.env.MONGODB_URI = originalMongoURI;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await mongoose.disconnect();
  });

  it("should connect successfully to the database", async () => {
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    await connectDatabase();
    expect(mongoose.connection.readyState).toBe(1);
    expect(logger.info).toHaveBeenCalledWith("Connected to MongoDB");
  });

  it("should handle connection errors", async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:1/nonexistent";

    await expect(connectDatabase()).rejects.toThrow();
    expect(logger.error).toHaveBeenCalled();
  });
});
