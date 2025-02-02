import { connectDatabase } from "../services/database";
import { DexTradeModel } from "../models/DexTrade";
import { RelatedEventModel } from "../models/RelatedEvent";
import logger from "../services/logger";

async function testDatabase() {
  try {
    await connectDatabase();

    // Test DexTrade Model
    const testTrade = new DexTradeModel({
      walletAddress: "0xtest123",
      timestamp: Date.now(),
      txHash: "0xabc123",
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
    });

    const savedTrade = await testTrade.save();
    logger.info("Saved trade:", savedTrade.toJSON());

    // Test RelatedEvent Model
    const testEvent = new RelatedEventModel({
      timestamp: Date.now(),
      source: "crypto_news",
      title: "Major Protocol Update",
      url: "https://example.com/news/1",
      summary: "A significant update was released",
      confidence: 0.95,
    });

    const savedEvent = await testEvent.save();
    logger.info("Saved event:", savedEvent.toJSON());

    // Retrieve all records
    const trades = await DexTradeModel.find();
    logger.info("All trades:", trades);

    const events = await RelatedEventModel.find();
    logger.info("All events:", events);
  } catch (error) {
    logger.error("Test failed:", error);
  } finally {
    process.exit();
  }
}

testDatabase();
