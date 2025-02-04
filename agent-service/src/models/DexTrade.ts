import mongoose, { Schema, Document } from "mongoose";
import { DexTrade } from "@/types";
import logger from "@/services/logger";

const DEFAULT_EXPIRATION_DAYS = 365;

interface TokenWithPrice {
  address: string;
  symbol: string;
  amount: string;
  priceUSD?: number;
  valueUSD?: number;
}

// Update DexTrade interface to include price information
export interface EnrichedDexTrade
  extends Omit<DexTrade, "tokenIn" | "tokenOut"> {
  tokenIn: TokenWithPrice;
  tokenOut: TokenWithPrice;
  isEnriched?: boolean;
}

export interface DexTradeDocument extends EnrichedDexTrade, Document {
  createdAt: Date;
  expiresAt: Date;
  toJSON(): EnrichedDexTrade & {
    _id: string;
    createdAt: Date;
    expiresAt: Date;
  };
}

const tokenSchema = {
  address: { type: String, required: true },
  symbol: { type: String, required: true },
  amount: { type: String, required: true },
  priceUSD: { type: Number },
  valueUSD: { type: Number },
};

const dexTradeSchema = new Schema({
  walletAddress: { type: String, required: true },
  timestamp: { type: Number, required: true },
  txHash: { type: String, required: true },
  dex: { type: String, required: true },
  tokenIn: tokenSchema,
  tokenOut: tokenSchema,
  isEnriched: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () =>
      new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
  },
});

// Remove existing indexes first
const setupIndexes = async () => {
  try {
    const model = mongoose.model<DexTradeDocument>("DexTrade", dexTradeSchema);

    // Drop all indexes except _id
    await model.collection.dropIndexes();

    // Create new indexes
    await model.collection.createIndexes([
      { key: { walletAddress: 1 } },
      { key: { timestamp: 1 } },
      { key: { txHash: 1 }, unique: true, background: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { isEnriched: 1 } }, // Add index for querying unenriched trades
    ]);

    logger.info("DexTrade indexes created successfully");
  } catch (error) {
    if (error instanceof Error && error.message.includes("E11000")) {
      logger.warn(
        "Duplicate key found during index creation, indexes may already exist"
      );
    } else {
      logger.error("Error creating indexes", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
};

dexTradeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return {
    ...obj,
    _id: obj._id.toString(),
    tokenIn: {
      address: obj.tokenIn.address,
      symbol: obj.tokenIn.symbol,
      amount: obj.tokenIn.amount,
      priceUSD: obj.tokenIn.priceUSD,
      valueUSD: obj.tokenIn.valueUSD,
    },
    tokenOut: {
      address: obj.tokenOut.address,
      symbol: obj.tokenOut.symbol,
      amount: obj.tokenOut.amount,
      priceUSD: obj.tokenOut.priceUSD,
      valueUSD: obj.tokenOut.valueUSD,
    },
  };
};

export const DexTradeModel = mongoose.model<DexTradeDocument>(
  "DexTrade",
  dexTradeSchema
);

setupIndexes().catch((error) => {
  logger.error("Failed to setup indexes", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
});

export { EnrichedDexTrade as DexTrade };
