import "@jest/globals";
import { RelatedEventModel } from "../RelatedEvent";
import { Error } from "mongoose";
import { beforeEach, describe, it, expect } from "@jest/globals";

describe("RelatedEvent Model", () => {
  const validEventData = {
    timestamp: Date.now(),
    source: "crypto_news",
    title: "Major Protocol Update",
    url: "https://example.com/news/1",
    summary: "A significant update was released for the protocol",
  };

  beforeEach(async () => {
    await RelatedEventModel.deleteMany({});
    await RelatedEventModel.createIndexes();
  });

  describe("Validation", () => {
    it("should create & save event successfully with valid data", async () => {
      const validEvent = new RelatedEventModel(validEventData);
      const savedEvent = await validEvent.save();
      const eventObject = savedEvent.toJSON();

      expect(savedEvent).toHaveProperty("_id");
      expect(eventObject).toMatchObject({
        source: validEventData.source,
        title: validEventData.title,
        url: validEventData.url,
        summary: validEventData.summary,
        timestamp: validEventData.timestamp,
      });
    });

    it("should fail to save event without required fields", async () => {
      const eventWithoutRequired = new RelatedEventModel({});
      let err: Error.ValidationError | undefined;

      try {
        await eventWithoutRequired.save();
      } catch (error) {
        err = error as Error.ValidationError;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error.ValidationError);
      expect(err?.errors.source).toBeDefined();
      expect(err?.errors.title).toBeDefined();
      expect(err?.errors.url).toBeDefined();
    });
  });

  describe("Indexes", () => {
    it("should have timestamp index", async () => {
      const indexes = await RelatedEventModel.collection.indexes();
      const hasTimestampIndex = indexes.some(
        (index) => index.key.timestamp === 1
      );
      expect(hasTimestampIndex).toBe(true);
    });
  });

  describe("TTL Index", () => {
    it("should set expiresAt field on creation", async () => {
      const event = new RelatedEventModel(validEventData);
      const savedEvent = await event.save();

      expect(savedEvent.expiresAt).toBeDefined();
      expect(savedEvent.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Document Methods", () => {
    it("should correctly serialize to JSON", async () => {
      const event = new RelatedEventModel(validEventData);
      const savedEvent = await event.save();
      const jsonEvent = savedEvent.toJSON();

      expect(jsonEvent).toHaveProperty("_id");
      expect(typeof jsonEvent._id).toBe("string");
      expect(jsonEvent).toMatchObject({
        source: validEventData.source,
        title: validEventData.title,
        url: validEventData.url,
        summary: validEventData.summary,
      });
    });
  });
});
