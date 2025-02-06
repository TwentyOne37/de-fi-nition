import { Agent } from "@covalenthq/ai-agent-sdk";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTrade } from "@/models/DexTrade";
import { RelatedEvent, RelatedEventModel } from "@/models/RelatedEvent";
import logger from "@/services/logger";

interface NewsSource {
  name: string;
  baseUrl: string;
  apiKey?: string;
}

interface EventCollectorConfig {
  minTradeValueUSD: number;
  timeWindowHours: number;
  sources: NewsSource[];
}

interface CryptoPanicNews {
  kind: string;
  domain: string;
  title: string;
  published_at: string;
  url: string;
  currencies: Array<{ code: string; title: string; slug: string }>;
}

interface CryptoPanicResponse {
  results: CryptoPanicNews[];
}

export class EventCollectorAgent
  implements BaseAgent<DexTrade[], RelatedEvent[]>
{
  public readonly name = "EventCollector";
  public readonly description = "Collect relevant news and events for trades";
  protected readonly _agent: Agent;
  private config: EventCollectorConfig;
  private cryptoPanicApiKey: string;

  constructor(apiKeys: Record<string, string>) {
    this.cryptoPanicApiKey = apiKeys.CRYPTOPANIC_API_KEY;
    if (!this.cryptoPanicApiKey) {
      logger.warn("CryptoPanic API key not provided");
    }

    this.config = {
      minTradeValueUSD: 10,
      timeWindowHours: 24,
      sources: [
        {
          name: "cryptopanic",
          baseUrl: "https://cryptopanic.com/api/v1/",
          apiKey: this.cryptoPanicApiKey,
        },
      ],
    };

    this._agent = new Agent({
      name: this.name,
      model: {
        provider: "OPEN_AI",
        name: "gpt-4o-mini",
      },
      description: this.description,
    });
  }

  private async findSignificantTrades(trades: DexTrade[]): Promise<DexTrade[]> {
    const significantTrades = trades.filter((trade) => {
      const valueUSD = trade.tokenIn.valueUSD || 0;
      const isSignificant = valueUSD >= this.config.minTradeValueUSD;

      logger.debug(`Trade value check:`, {
        txHash: trade.txHash,
        value: valueUSD,
        threshold: this.config.minTradeValueUSD,
        isSignificant,
      });

      return isSignificant;
    });

    logger.info(
      `Found ${significantTrades.length} significant trades out of ${trades.length} total`
    );
    return significantTrades;
  }

  private async searchEvents(trade: DexTrade): Promise<RelatedEvent[]> {
    const events: RelatedEvent[] = [];
    const timeWindow = this.config.timeWindowHours * 60 * 60 * 1000;

    const startTime = trade.timestamp - timeWindow;
    const endTime = trade.timestamp + timeWindow;

    logger.info(`Searching events for trade`, {
      txHash: trade.txHash,
      tokens: [trade.tokenIn.symbol, trade.tokenOut.symbol],
      timeRange: `${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`,
    });

    for (const source of this.config.sources) {
      try {
        const tokens = [trade.tokenIn.symbol, trade.tokenOut.symbol];
        const searchResults = await this.searchNewsSource(
          source,
          tokens,
          startTime,
          endTime
        );

        logger.debug(`Search results from ${source.name}:`, {
          resultsCount: searchResults.length,
          tokens,
        });

        events.push(...searchResults);
      } catch (error) {
        logger.error(`Error searching ${source.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
          trade: trade.txHash,
        });
      }
    }

    return events;
  }

  private async searchNewsSource(
    source: NewsSource,
    tokens: string[],
    startTime: number,
    endTime: number
  ): Promise<RelatedEvent[]> {
    switch (source.name) {
      case "cryptopanic":
        return this.searchCryptoPanic(tokens, startTime, endTime);
      default:
        logger.warn(`Unknown news source: ${source.name}`);
        return [];
    }
  }

  private async searchCryptoPanic(
    tokens: string[],
    startTime: number,
    endTime: number
  ): Promise<RelatedEvent[]> {
    if (!this.cryptoPanicApiKey) {
      logger.warn("CryptoPanic API key not configured");
      return [];
    }

    try {
      // Convert tokens to standard format (e.g., WETH -> ETH)
      const normalizedTokens = tokens.map((token) => {
        if (token === "WETH") return "ETH";
        if (token === "WBTC") return "BTC";
        return token;
      });

      // Convert timestamps to ISO strings
      const fromDate = new Date(startTime).toISOString();
      const toDate = new Date(endTime).toISOString();

      const currencyParam = [...new Set(normalizedTokens)].join(",");
      const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.cryptoPanicApiKey}&currencies=${currencyParam}&public=true&filter=important&from=${fromDate}&to=${toDate}`;

      logger.debug("Fetching CryptoPanic news:", {
        currencies: currencyParam,
        from: fromDate,
        to: toDate,
      });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CryptoPanic API error: ${response.statusText}`);
      }

      const data = (await response.json()) as CryptoPanicResponse;
      logger.debug(
        `Received ${data.results?.length || 0} results from CryptoPanic`
      );

      if (!data.results) {
        return [];
      }

      return data.results.map((item) => ({
        timestamp: new Date(item.published_at).getTime(),
        source: "cryptopanic",
        title: item.title,
        url: item.url,
        summary: `${item.kind} news from ${item.domain}`,
        confidence: item.kind === "news" ? 0.8 : 0.6,
      }));
    } catch (error) {
      logger.error("Error fetching CryptoPanic news:", {
        error: error instanceof Error ? error.message : "Unknown error",
        tokens,
      });
      return [];
    }
  }

  private async storeEvents(events: RelatedEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const operations = events.map((event) => ({
        updateOne: {
          filter: {
            source: event.source,
            title: event.title,
            timestamp: event.timestamp,
          },
          update: { $set: event },
          upsert: true,
        },
      }));

      const result = await RelatedEventModel.bulkWrite(operations);
      logger.info(`Stored events:`, {
        total: operations.length,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
      });
    } catch (error) {
      logger.error("Failed to store events", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  public async run(trades: DexTrade[]): Promise<RelatedEvent[]> {
    logger.info(`Starting event collection for ${trades.length} trades`);

    try {
      const significantTrades = await this.findSignificantTrades(trades);
      const allEvents: RelatedEvent[] = [];

      for (const trade of significantTrades) {
        const events = await this.searchEvents(trade);
        if (events.length > 0) {
          allEvents.push(...events);
          await this.storeEvents(events);
          logger.info(
            `Found ${events.length} events for trade ${trade.txHash}`
          );
        } else {
          logger.debug(`No events found for trade ${trade.txHash}`);
        }
      }

      logger.info(`Event collection completed:`, {
        tradesProcessed: significantTrades.length,
        eventsFound: allEvents.length,
      });

      return allEvents;
    } catch (error) {
      logger.error("Event collection failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
