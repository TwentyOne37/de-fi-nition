// src/models/CollectionJob.ts
import mongoose, { Document, Schema } from "mongoose";

export interface ICollectionJob extends Document {
  address: string;
  startDate: Date;
  endDate: Date;
  status: "queued" | "processing" | "completed" | "failed";
  progress: {
    tradesCollected: number;
    tradesProcessed: number;
    eventsCollected: number;
    tradesEnriched: number;
    lastProcessedDate?: Date;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionJobSchema = new Schema<ICollectionJob>(
  {
    address: { type: String, required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
    },
    progress: {
      tradesCollected: { type: Number, default: 0 },
      tradesProcessed: { type: Number, default: 0 },
      tradesEnriched: { type: Number, default: 0 },
      eventsCollected: { type: Number, default: 0 },
      lastProcessedDate: { type: Date },
    },
    error: { type: String },
  },
  {
    timestamps: true,
  }
);

CollectionJobSchema.index({ address: 1, createdAt: -1 });

export const CollectionJob = mongoose.model<ICollectionJob>(
  "CollectionJob",
  CollectionJobSchema
);
