import "@jest/globals";
import { DexTradeModel } from "../DexTrade";
import { Error } from "mongoose";
import { beforeEach, describe, it, expect } from "@jest/globals";

describe("DexTrade Model", () => {
  const validTradeData = {
    walletAddress: "0x1234567890abcdef",
    timestamp: Date.now(),
    txHash: "0xabcdef1234567890",
    dex: "uniswap",
    tokenIn: {
      address: "0xtoken1",
      symbol: "ETH",
      amount: "1000000000000000000",
    },
    tokenOut: {
      address: "0xtoken2",
      symbol: "USDC",
      amount: "1500000000",
    },
  };

  beforeEach(async () => {
    await DexTradeModel.deleteMany({});
    await DexTradeModel.createIndexes();
  });

  describe("Validation", () => {
    it("should create & save trade successfully with valid data", async () => {
      const validTrade = new DexTradeModel(validTradeData);
      const savedTrade = await validTrade.save();
      const tradeObject = savedTrade.toJSON();

      expect(savedTrade).toHaveProperty("_id");
      expect(tradeObject).toMatchObject({
        walletAddress: validTradeData.walletAddress,
        txHash: validTradeData.txHash,
        dex: validTradeData.dex,
        tokenIn: {
          symbol: validTradeData.tokenIn.symbol,
          address: validTradeData.tokenIn.address,
          amount: validTradeData.tokenIn.amount,
        },
        tokenOut: {
          symbol: validTradeData.tokenOut.symbol,
          address: validTradeData.tokenOut.address,
          amount: validTradeData.tokenOut.amount,
        },
      });
    });

    it("should fail to save trade without required fields", async () => {
      const tradeWithoutRequired = new DexTradeModel({});
      let err: Error.ValidationError | undefined;

      try {
        await tradeWithoutRequired.save();
      } catch (error) {
        err = error as Error.ValidationError;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(Error.ValidationError);
      expect(err?.errors.walletAddress).toBeDefined();
      expect(err?.errors.txHash).toBeDefined();
    });

    it("should fail to save duplicate txHash", async () => {
      const firstTrade = new DexTradeModel(validTradeData);
      await firstTrade.save();

      const duplicateTrade = new DexTradeModel(validTradeData);
      let err: any;

      try {
        await duplicateTrade.save();
        expect("should have thrown").toBe("error");
      } catch (error: any) {
        console.log("Duplicate save error:", error);
        err = error;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe("MongoServerError");
      expect(err.code).toBe(11000);
    });
  });

  describe("Indexes", () => {
    it("should have proper indexes", async () => {
      const indexes = await DexTradeModel.collection.indexes();

      const hasWalletIndex = indexes.some(
        (index) => index.key.walletAddress === 1
      );
      const hasTimestampIndex = indexes.some(
        (index) => index.key.timestamp === 1
      );
      const hasTxHashIndex = indexes.some((index) => index.key.txHash === 1);

      expect(hasWalletIndex).toBe(true);
      expect(hasTimestampIndex).toBe(true);
      expect(hasTxHashIndex).toBe(true);
    });
  });

  describe("TTL Index", () => {
    it("should set expiresAt field on creation", async () => {
      const trade = new DexTradeModel(validTradeData);
      const savedTrade = await trade.save();

      expect(savedTrade.expiresAt).toBeDefined();
      expect(savedTrade.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Document Methods", () => {
    it("should correctly serialize to JSON", async () => {
      const trade = new DexTradeModel(validTradeData);
      const savedTrade = await trade.save();
      const jsonTrade = savedTrade.toJSON();

      expect(jsonTrade).toHaveProperty("_id");
      expect(typeof jsonTrade._id).toBe("string");
      expect(jsonTrade).toMatchObject({
        walletAddress: validTradeData.walletAddress,
        txHash: validTradeData.txHash,
        dex: validTradeData.dex,
        tokenIn: validTradeData.tokenIn,
        tokenOut: validTradeData.tokenOut,
      });
    });
  });
});
