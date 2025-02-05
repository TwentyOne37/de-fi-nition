import mongoose, { Schema, Document } from "mongoose";
import { RelatedEvent } from "@/types";
import { DEFAULT_EXPIRATION_DAYS } from "../config";

export interface RelatedEventDocument extends RelatedEvent, Document {
  createdAt: Date;
  expiresAt: Date;
  toJSON(): RelatedEvent & { _id: string; createdAt: Date; expiresAt: Date };
}

const relatedEventSchema = new Schema({
  timestamp: { type: Number, required: true },
  source: { type: String, required: true },
  title: { type: String, required: true },
  url: { type: String, required: true },
  summary: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () =>
      new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
  },
});

relatedEventSchema.index({ timestamp: 1 });
relatedEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

relatedEventSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return {
    ...obj,
    _id: obj._id.toString(),
  };
};

export const RelatedEventModel = mongoose.model<RelatedEventDocument>(
  "RelatedEvent",
  relatedEventSchema
);

RelatedEventModel.createIndexes().catch(console.error);
export { RelatedEvent };
