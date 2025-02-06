import { GoldRushClient } from "@covalenthq/client-sdk";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTradeModel, EnrichedDexTrade } from "@/models/DexTrade";
import logger from "@/services/logger";

interface EnrichmentResult {
  success: boolean;
  processed: number;
  enriched: number;
  errors?: string[];
}

export class PriceEnrichmentAgent implements BaseAgent<void, EnrichmentResult> {
  private goldRushClient: GoldRushClient;
  public readonly name = "PriceEnrichment";
  public readonly description = "Enrich DEX trades with historical price data";

  constructor(apiKey: string) {
    this.goldRushClient = new GoldRushClient(apiKey);
  }

  private async getTokenPrices(
    addresses: string[],
    timestamp: number
  ): Promise<Map<string, number>> {
    try {
      // Convert timestamp to YYYY-MM-DD
      const date = new Date(timestamp).toISOString().split("T")[0];

      logger.debug("Fetching prices", { addresses, date });

      const response = await this.goldRushClient.PricingService.getTokenPrices(
        "base-mainnet",
        "USD",
        addresses.join(","),
        {
          from: date,
          to: date,
          pricesAtAsc: true,
        }
      );

      const priceMap = new Map<string, number>();

      if (response?.data) {
        // Each response item represents one token's price data
        response.data.forEach((tokenData) => {
          if (tokenData?.items && tokenData.items.length > 0) {
            const latestPrice = tokenData.items[0].price;
            if (latestPrice && tokenData.contract_address) {
              priceMap.set(
                tokenData.contract_address.toLowerCase(),
                latestPrice
              );
              logger.debug("Found price", {
                token: tokenData.contract_address,
                symbol: tokenData.contract_ticker_symbol,
                price: latestPrice,
              });
            }
          }
        });
      }

      return priceMap;
    } catch (error) {
      logger.error("Failed to get token prices", {
        error: error instanceof Error ? error.message : "Unknown error",
        addresses,
        timestamp,
      });
      return new Map();
    }
  }

  private async enrichBatch(trades: EnrichedDexTrade[]): Promise<number> {
    try {
      // Get unique token addresses
      const tokenAddresses = new Set<string>();
      trades.forEach((trade) => {
        tokenAddresses.add(trade.tokenIn.address.toLowerCase());
        tokenAddresses.add(trade.tokenOut.address.toLowerCase());
      });

      // Group trades by date to minimize API calls
      const tradesByDate = trades.reduce(
        (acc, trade) => {
          const date = new Date(trade.timestamp).toISOString().split("T")[0];
          if (!acc[date]) {
            acc[date] = [];
          }
          acc[date].push(trade);
          return acc;
        },
        {} as Record<string, EnrichedDexTrade[]>
      );

      let enrichedCount = 0;

      // Process each date group
      for (const [date, dateTrades] of Object.entries(tradesByDate)) {
        const timestamp = new Date(date).getTime();
        logger.info(`Processing trades for date: ${date}`);

        const prices = await this.getTokenPrices(
          Array.from(tokenAddresses),
          timestamp
        );

        // Update trades with price data
        for (const trade of dateTrades) {
          const inPrice = prices.get(trade.tokenIn.address.toLowerCase());
          const outPrice = prices.get(trade.tokenOut.address.toLowerCase());

          if (inPrice && outPrice) {
            // For token amounts, we need to consider decimals
            // Convert amounts from wei to token units
            const inDecimals = trade.tokenIn.symbol === "USDC" ? 6 : 18; // Default to 18 for most tokens
            const outDecimals = trade.tokenOut.symbol === "USDC" ? 6 : 18;

            const inAmount =
              parseFloat(trade.tokenIn.amount) / Math.pow(10, inDecimals);
            const outAmount =
              parseFloat(trade.tokenOut.amount) / Math.pow(10, outDecimals);

            await DexTradeModel.updateOne(
              { txHash: trade.txHash },
              {
                $set: {
                  "tokenIn.priceUSD": inPrice,
                  "tokenIn.valueUSD": inPrice * inAmount,
                  "tokenOut.priceUSD": outPrice,
                  "tokenOut.valueUSD": outPrice * outAmount,
                  isEnriched: true,
                },
              }
            );

            logger.debug("Enriched trade", {
              txHash: trade.txHash,
              inToken: `${trade.tokenIn.symbol} (${inPrice} USD)`,
              outToken: `${trade.tokenOut.symbol} (${outPrice} USD)`,
              inValue: inPrice * inAmount,
              outValue: outPrice * outAmount,
            });

            enrichedCount++;
          } else {
            logger.warn("Missing price data for trade", {
              txHash: trade.txHash,
              inToken: `${trade.tokenIn.symbol} (${trade.tokenIn.address})`,
              outToken: `${trade.tokenOut.symbol} (${trade.tokenOut.address})`,
              hasInPrice: !!inPrice,
              hasOutPrice: !!outPrice,
            });
          }
        }
      }

      return enrichedCount;
    } catch (error) {
      logger.error("Failed to enrich batch", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return 0;
    }
  }

  async run(): Promise<EnrichmentResult> {
    logger.info("Starting price enrichment process");

    try {
      // Get unenriched trades in batches
      const batchSize = 20; // Smaller batch size to avoid rate limits
      const trades = await DexTradeModel.find({ isEnriched: false })
        .sort({ timestamp: -1 })
        .limit(batchSize);

      if (!trades.length) {
        logger.info("No trades need enrichment");
        return { success: true, processed: 0, enriched: 0 };
      }

      logger.info(`Found ${trades.length} trades to enrich`);

      // Process trades in batch
      const enrichedCount = await this.enrichBatch(trades);

      const result = {
        success: true,
        processed: trades.length,
        enriched: enrichedCount,
      };

      logger.info("Enrichment process completed", result);
      return result;
    } catch (error) {
      logger.error("Enrichment process failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        processed: 0,
        enriched: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }
}
