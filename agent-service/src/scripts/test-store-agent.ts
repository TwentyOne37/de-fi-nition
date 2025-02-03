// src/scripts/store-trades.ts
import { DexTradeModel } from "@/models/DexTrade";
import { TradeCollectorAgent } from "../agents/collector";
import { TradeStorageAgent } from "../agents/storage";
import { connectDatabase } from "../services/database";
import logger from "../services/logger";
import config from "@/config";

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    logger.info("Creating agents...");
    const collector = new TradeCollectorAgent(config.COVALENT_API_KEY);
    const storage = new TradeStorageAgent();

    const testWallet = "0xf1D3d73a34f917291cDdf07fE7c8bE874c55EC16";
    logger.info(`Fetching trades for wallet: ${testWallet}`);

    // Collect trades
    const trades = await collector.run({
      walletAddress: testWallet,
      startTime: Date.now() - 24 * 60 * 60 * 1000,
    });

    logger.info(`Found ${trades.length} trades, storing in database...`);

    // Store trades
    const result = await storage.run(trades);

    logger.info("Storage complete", {
      success: result.success,
      stored: result.stored,
    });

    // Optional: Print summary of stored trades
    const storedTrades = await DexTradeModel.find({
      walletAddress: testWallet,
      timestamp: { $gte: Date.now() - 24 * 60 * 60 * 1000 },
    }).sort({ timestamp: -1 });

    console.log("\n=== Storage Summary ===");
    console.log(`Total trades stored: ${storedTrades.length}`);
    console.log(`Latest trades in DB:`);
    storedTrades.slice(0, 5).forEach((trade) => {
      console.log(
        `  ${new Date(trade.timestamp).toISOString().split("T")[0]} | ` +
          `${trade.dex} | ${trade.txHash.slice(0, 10)}...`
      );
    });

    process.exit(0);
  } catch (error) {
    logger.error("Error in store-trades script", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
