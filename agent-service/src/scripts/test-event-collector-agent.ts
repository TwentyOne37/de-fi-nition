// src/scripts/test-event-collector.ts
import { connectDatabase } from "@/services/database";
import { DexTradeModel } from "@/models/DexTrade";
import { EventCollectorAgent } from "../agents/event-collector";
import logger from "@/services/logger";
import config from "@/config";

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    logger.info("Starting event collector test");

    // Create event collector with API keys
    const eventCollector = new EventCollectorAgent({
      CRYPTOPANIC_API_KEY: config.CRYPTOPANIC_API_KEY,
      // Add other API keys as needed
    });

    // Get recent significant trades from database
    const recentTrades = await DexTradeModel.find({
      "tokenIn.valueUSD": { $gte: 100 }, // $100 minimum
      timestamp: {
        $gte: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
      },
    }).sort({ timestamp: -1 });

    logger.info(`Found ${recentTrades.length} significant trades to analyze`);

    // Collect events
    const events = await eventCollector.run(recentTrades);

    // Display results
    console.log("\n=== Event Collection Summary ===");
    console.log(`Analyzed trades: ${recentTrades.length}`);
    console.log(`Found events: ${events.length}`);

    if (events.length > 0) {
      console.log("\nSample Events:");
      events.slice(0, 5).forEach((event) => {
        const date = new Date(event.timestamp).toISOString().split("T")[0];
        console.log(`
          Date: ${date}
          Title: ${event.title}
          Source: ${event.source}
          Confidence: ${event.confidence}
          URL: ${event.url}
          ---
        `);
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error in event collector test", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
