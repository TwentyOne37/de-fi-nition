// src/services/collection.service.ts
import logger from "./logger";
import { CollectionJob, ICollectionJob } from "../models/CollectionJob";
import { TradeCollectorAgent } from "../agents/collector";
import { TradeValidatorAgent } from "../agents/validator";
import { TradeStorageAgent } from "../agents/storage";
import { PriceEnrichmentAgent } from "../agents/enrichment";
import { EventCollectorAgent } from "../agents/event-collector";
import config from "../config";

const ONE_DAY = 24 * 60 * 60 * 1000;

class CollectionWorkflow {
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

  // src/services/collection.service.ts
  private async collectAndStoreTrades(
    walletAddress: string,
    startTime: number,
    endTime: number
  ) {
    logger.info(`Collecting trades for ${new Date(startTime).toISOString()}`);

    // Collect trades
    const trades = await this.collector.run({
      walletAddress,
      startTime,
      endTime,
    });
    logger.info(`Collected ${trades.length} raw trades`);

    if (trades.length === 0) {
      return {
        collected: 0,
        stored: 0,
        enriched: 0,
        events: 0,
      };
    }

    // Store trades directly without validation for now
    // TODO: Fix validation schema
    const storageResult = await this.storage.run(trades);
    logger.info(`Stored ${storageResult.stored} trades`);

    // Enrich trades with price data
    const enrichmentResult = await this.enrichment.run();
    logger.info(`Enriched ${enrichmentResult.enriched} trades with price data`);

    // Collect related events
    const events = await this.eventCollector.run(trades);
    logger.info(`Collected ${events.length} related events`);

    return {
      collected: trades.length,
      stored: storageResult.stored,
      enriched: enrichmentResult.enriched,
      events: events.length,
    };
  }

  async processBatch(job: ICollectionJob, startTime: number, endTime: number) {
    try {
      const result = await this.collectAndStoreTrades(
        job.address,
        startTime,
        endTime
      );

      // Update job progress
      job.progress.tradesCollected += result.collected;
      job.progress.tradesProcessed += result.stored;
      job.progress.tradesEnriched += result.enriched;
      job.progress.eventsCollected += result.events;
      job.progress.lastProcessedDate = new Date(endTime);
      await job.save();

      return result;
    } catch (error) {
      logger.error(`Batch processing failed`, {
        startTime: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}

export async function startCollectionJob(jobId: string): Promise<void> {
  const job = await CollectionJob.findById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const workflow = new CollectionWorkflow();

  try {
    // Initialize job state
    job.status = "processing";
    await job.save();

    let currentDate = new Date(job.startDate);
    const endDate = new Date(job.endDate);

    // Process day by day
    while (currentDate < endDate) {
      const nextDate = new Date(currentDate.getTime() + ONE_DAY);

      try {
        await workflow.processBatch(
          job,
          currentDate.getTime(),
          nextDate.getTime()
        );
      } catch (error) {
        logger.warn(`Failed to process batch, continuing with next day`, {
          date: currentDate.toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      currentDate = nextDate;
    }

    // Mark job as completed
    job.status = "completed";
    await job.save();

    logger.info(`Collection job ${jobId} completed successfully`, {
      tradesCollected: job.progress.tradesCollected,
      tradesProcessed: job.progress.tradesProcessed,
      tradesEnriched: job.progress.tradesEnriched,
      eventsCollected: job.progress.eventsCollected,
    });
  } catch (error) {
    logger.error(`Failed to process collection job ${jobId}:`, error);

    // Update job status
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    await job.save();
  }
}
