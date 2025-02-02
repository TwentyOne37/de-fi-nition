import mongoose, { Schema, Document } from "mongoose";
import { DexTrade } from "@/types";

const DEFAULT_EXPIRATION_DAYS = 365;

export interface DexTradeDocument extends DexTrade, Document {
  createdAt: Date;
  expiresAt: Date;
  toJSON(): DexTrade & { _id: string; createdAt: Date; expiresAt: Date };
}

const dexTradeSchema = new Schema({
  walletAddress: { type: String, required: true },
  timestamp: { type: Number, required: true },
  txHash: { type: String, required: true },
  dex: { type: String, required: true },
  tokenIn: {
    address: { type: String, required: true },
    symbol: { type: String, required: true },
    amount: { type: String, required: true },
  },
  tokenOut: {
    address: { type: String, required: true },
    symbol: { type: String, required: true },
    amount: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () =>
      new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
  },
});

dexTradeSchema.index({ walletAddress: 1 });
dexTradeSchema.index({ timestamp: 1 });
dexTradeSchema.index({ txHash: 1 }, { unique: true, background: true });
dexTradeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

dexTradeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return {
    ...obj,
    _id: obj._id.toString(),
    tokenIn: {
      address: obj.tokenIn.address,
      symbol: obj.tokenIn.symbol,
      amount: obj.tokenIn.amount,
    },
    tokenOut: {
      address: obj.tokenOut.address,
      symbol: obj.tokenOut.symbol,
      amount: obj.tokenOut.amount,
    },
  };
};

export const DexTradeModel = mongoose.model<DexTradeDocument>(
  "DexTrade",
  dexTradeSchema
);

DexTradeModel.createIndexes().catch(console.error);
