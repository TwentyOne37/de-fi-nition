import { connectDatabase } from "@/services/database";
import { PriceEnrichmentAgent } from "../agents/enrichment";
import { DexTradeModel } from "@/models/DexTrade";
import logger from "@/services/logger";
import config from "@/config";

const formatUSD = (value?: number): string => {
  if (!value) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    logger.info("Starting price enrichment test");

    const enrichment = new PriceEnrichmentAgent(config.COVALENT_API_KEY);

    // Run enrichment
    const result = await enrichment.run();
    logger.info("Enrichment complete", result);

    if (result.enriched > 0) {
      // Display some enriched trades
      const enrichedTrades = await DexTradeModel.find({ isEnriched: true })
        .sort({ timestamp: -1 })
        .limit(5);

      console.log("\n=== Recently Enriched Trades ===");
      enrichedTrades.forEach((trade) => {
        const date = new Date(trade.timestamp).toISOString().split("T")[0];
        console.log(`
            Date: ${date}
            DEX: ${trade.dex}
            Input: ${trade.tokenIn.amount} ${trade.tokenIn.symbol} (${formatUSD(trade.tokenIn.valueUSD)})
            Output: ${trade.tokenOut.amount} ${trade.tokenOut.symbol} (${formatUSD(trade.tokenOut.valueUSD)})
            Hash: ${trade.txHash.slice(0, 10)}...
        `);
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error in price enrichment test", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
