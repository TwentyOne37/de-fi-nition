import { TradeCollectorAgent } from "../agents/collector";
import { TradeValidatorAgent } from "../agents/validator";
import { TradeStorageAgent } from "../agents/storage";
import { PriceEnrichmentAgent } from "../agents/enrichment";
import { EventCollectorAgent } from "../agents/event-collector";
import { connectDatabase } from "../services/database";
import { DexTradeModel } from "@/models/DexTrade";
import { RelatedEventModel } from "@/models/RelatedEvent";
import logger from "@/services/logger";
import config from "@/config";

interface BatchConfig {
  walletAddress: string;
  startTime: number;
  endTime: number;
  batchSizeHours: number;
  delayBetweenBatchesMs: number;
}

interface BatchStats {
  tradesCollected: number;
  tradesStored: number;
  tradesEnriched: number;
  eventsCollected: number;
}

class BatchedAnalysisWorkflow {
  private collector: TradeCollectorAgent;
  private validator: TradeValidatorAgent;
  private storage: TradeStorageAgent;
  private enrichment: PriceEnrichmentAgent;
  private eventCollector: EventCollectorAgent;

  constructor() {
    this.collector = new TradeCollectorAgent(config.COVALENT_API_KEY);
    this.validator = new TradeValidatorAgent();
    this.storage = new TradeStorageAgent();
    this.enrichment = new PriceEnrichmentAgent(config.COVALENT_API_KEY);
    this.eventCollector = new EventCollectorAgent({
      CRYPTOPANIC_API_KEY: config.CRYPTOPANIC_API_KEY,
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split("T")[0];
  }

  private async collectAndStoreTrades(
    walletAddress: string,
    startTime: number,
    endTime: number
  ): Promise<BatchStats> {
    logger.info(`Step 1: Collecting trades for ${this.formatDate(startTime)}`);

    // Collect trades
    const trades = await this.collector.run({
      walletAddress,
      startTime,
      endTime,
    });
    logger.info(`Collected ${trades.length} raw trades`);

    if (trades.length === 0) {
      return {
        tradesCollected: 0,
        tradesStored: 0,
        tradesEnriched: 0,
        eventsCollected: 0,
      };
    }

    // Store trades
    const storageResult = await this.storage.run(trades);
    logger.info(`Stored ${storageResult.stored} trades`);

    return {
      tradesCollected: trades.length,
      tradesStored: storageResult.stored,
      tradesEnriched: 0,
      eventsCollected: 0,
    };
  }

  private async enrichTrades(
    startTime: number,
    endTime: number
  ): Promise<number> {
    logger.info(`Step 2: Enriching trades for ${this.formatDate(startTime)}`);

    const enrichmentResult = await this.enrichment.run();
    logger.info(`Enriched ${enrichmentResult.enriched} trades with price data`);

    return enrichmentResult.enriched;
  }

  private async collectEvents(
    startTime: number,
    endTime: number
  ): Promise<number> {
    logger.info(`Step 3: Collecting events for ${this.formatDate(startTime)}`);

    // Get enriched trades for this time period
    const enrichedTrades = await DexTradeModel.find({
      timestamp: { $gte: startTime, $lt: endTime },
      isEnriched: true,
      "tokenIn.valueUSD": { $exists: true },
    }).sort({ timestamp: -1 });

    if (enrichedTrades.length === 0) {
      logger.info("No enriched trades found for event collection");
      return 0;
    }

    const events = await this.eventCollector.run(enrichedTrades);
    logger.info(`Collected ${events.length} events`);

    return events.length;
  }

  public async processBatch(
    config: BatchConfig,
    batchStart: number,
    batchEnd: number
  ): Promise<BatchStats> {
    try {
      logger.info(`\n=== Processing batch ${this.formatDate(batchStart)} ===`);

      // Step 1: Collect and store trades
      const stats = await this.collectAndStoreTrades(
        config.walletAddress,
        batchStart,
        batchEnd
      );

      if (stats.tradesStored > 0) {
        // Step 2: Enrich trades with price data
        const enriched = await this.enrichTrades(batchStart, batchEnd);
        stats.tradesEnriched = enriched;

        // Step 3: Collect events for enriched trades
        const events = await this.collectEvents(batchStart, batchEnd);
        stats.eventsCollected = events;
      }

      // Log batch summary
      logger.info(`Batch Summary for ${this.formatDate(batchStart)}:`, {
        tradesCollected: stats.tradesCollected,
        tradesStored: stats.tradesStored,
        tradesEnriched: stats.tradesEnriched,
        eventsCollected: stats.eventsCollected,
      });

      return stats;
    } catch (error) {
      logger.error(
        `Batch processing failed for ${this.formatDate(batchStart)}`,
        {
          error: error instanceof Error ? error.message : "Unknown error",
        }
      );
      throw error;
    }
  }

  public async run(config: BatchConfig): Promise<BatchStats[]> {
    const allStats: BatchStats[] = [];
    const batchSize = config.batchSizeHours * 60 * 60 * 1000;

    let currentStart = config.startTime;
    while (currentStart < config.endTime) {
      const batchEnd = Math.min(currentStart + batchSize, config.endTime);

      try {
        const batchStats = await this.processBatch(
          config,
          currentStart,
          batchEnd
        );
        allStats.push(batchStats);
      } catch (error) {
        logger.warn(
          `Skipping problematic batch ${this.formatDate(currentStart)}`,
          {
            error: error instanceof Error ? error.message : "Unknown error",
          }
        );
      }

      await this.delay(config.delayBetweenBatchesMs);
      currentStart = batchEnd;
    }

    return allStats;
  }

  public async summarizeResults(stats: BatchStats[]): Promise<void> {
    const totals = stats.reduce(
      (acc, curr) => ({
        tradesCollected: acc.tradesCollected + curr.tradesCollected,
        tradesStored: acc.tradesStored + curr.tradesStored,
        tradesEnriched: acc.tradesEnriched + curr.tradesEnriched,
        eventsCollected: acc.eventsCollected + curr.eventsCollected,
      }),
      {
        tradesCollected: 0,
        tradesStored: 0,
        tradesEnriched: 0,
        eventsCollected: 0,
      }
    );

    console.log("\n=== Analysis Summary ===");
    console.log(`Total batches processed: ${stats.length}`);
    console.log(`Total trades collected: ${totals.tradesCollected}`);
    console.log(`Total trades stored: ${totals.tradesStored}`);
    console.log(`Total trades enriched: ${totals.tradesEnriched}`);
    console.log(`Total events collected: ${totals.eventsCollected}`);

    // Display significant trades
    const significantTrades = await DexTradeModel.find({
      isEnriched: true,
      "tokenIn.valueUSD": { $gte: 10000 },
    }).sort({ timestamp: 1 });

    if (significantTrades.length > 0) {
      console.log("\n=== Significant Trades ($10k+) ===");
      significantTrades.forEach((trade) => {
        const date = this.formatDate(trade.timestamp);
        const valueIn = trade.tokenIn.valueUSD?.toFixed(2) || "0";
        const valueOut = trade.tokenOut.valueUSD?.toFixed(2) || "0";

        console.log(`
          Date: ${date}
          DEX: ${trade.dex}
          Value: $${valueIn} ${trade.tokenIn.symbol} → $${valueOut} ${trade.tokenOut.symbol}
          Hash: ${trade.txHash.slice(0, 10)}...
        `);
      });
    }

    // Display events with high confidence
    const significantEvents = await RelatedEventModel.find({
      confidence: { $gte: 0.8 },
    }).sort({ timestamp: 1 });

    if (significantEvents.length > 0) {
      console.log("\n=== High Confidence Events ===");
      significantEvents.forEach((event) => {
        console.log(`
          Date: ${this.formatDate(event.timestamp)}
          Title: ${event.title}
          Confidence: ${event.confidence}
          Source: ${event.source}
        `);
      });
    }
  }
}

async function main() {
  try {
    await connectDatabase();

    const workflow = new BatchedAnalysisWorkflow();

    const config: BatchConfig = {
      walletAddress: "0xf1D3d73a34f917291cDdf07fE7c8bE874c55EC16",
      startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      endTime: Date.now(),
      batchSizeHours: 24,
      delayBetweenBatchesMs: 2000, // 2 second delay between batches
    };

    logger.info("Starting batch analysis", {
      wallet: config.walletAddress,
      startDate: new Date(config.startTime).toISOString(),
      endDate: new Date(config.endTime).toISOString(),
      batchSize: `${config.batchSizeHours} hours`,
    });

    const stats = await workflow.run(config);
    await workflow.summarizeResults(stats);

    process.exit(0);
  } catch (error) {
    logger.error("Analysis workflow failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
