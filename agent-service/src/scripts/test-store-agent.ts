import { DexTradeModel } from "@/models/DexTrade";
import { TradeCollectorAgent } from "../agents/collector";
import { TradeStorageAgent } from "../agents/storage";
import { connectDatabase } from "../services/database";
import logger from "../services/logger";
import config from "@/config";

const formatAmount = (amount: string, symbol: string): string => {
  const decimals = symbol === "USDC" ? 6 : 18;
  const num = Number(amount) / Math.pow(10, decimals);
  return `${num.toFixed(4)} ${symbol}`;
};

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    logger.info("Creating agents...");
    const collector = new TradeCollectorAgent(config.COVALENT_API_KEY);
    const storage = new TradeStorageAgent();

    const testWallet = "0xf1D3d73a34f917291cDdf07fE7c8bE874c55EC16";
    logger.info(`Fetching trades for wallet: ${testWallet}`);

    // Collect trades for the last 24 hours
    const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trades = await collector.run({
      walletAddress: testWallet,
      startTime,
    });

    logger.info(`Found ${trades.length} trades, storing in database...`);

    // Store trades
    const result = await storage.run(trades);
    logger.info("Storage complete", {
      success: result.success,
      stored: result.stored,
    });

    // Query stored trades with proper time range
    const storedTrades = await DexTradeModel.find({
      walletAddress: testWallet.toLowerCase(),
      timestamp: { $gte: startTime },
    }).sort({ timestamp: -1 });

    console.log("\n=== Storage Summary ===");
    console.log(`Total trades stored: ${storedTrades.length}`);

    if (storedTrades.length > 0) {
      console.log("\nLatest trades in DB:");
      storedTrades.slice(0, 5).forEach((trade) => {
        const date = new Date(trade.timestamp).toISOString().split("T")[0];
        console.log(
          `  ${date} | ${trade.dex} | ` +
            `${formatAmount(trade.tokenIn.amount, trade.tokenIn.symbol)} → ` +
            `${formatAmount(trade.tokenOut.amount, trade.tokenOut.symbol)} | ` +
            `${trade.txHash.slice(0, 10)}...`
        );
      });
    }

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
