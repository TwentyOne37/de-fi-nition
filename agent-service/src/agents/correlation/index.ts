import { Agent } from "@covalenthq/ai-agent-sdk";
import { createTool } from "@covalenthq/ai-agent-sdk";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTradeModel, EnrichedDexTrade } from "@/models/DexTrade";
import { RelatedEventModel } from "@/models/RelatedEvent";
import logger from "@/services/logger";
import { z } from "zod";

interface CorrelationMetrics {
  totalValue: number;
  tradeCount: number;
  averageTradeValue: number;
  largestTrade: number;
  tokenPairs: Array<{
    tokenIn: string;
    tokenOut: string;
    count: number;
  }>;
  timeAnalysis: {
    startTime: number;
    endTime: number;
    averageTimeBetweenTrades: number;
  };
}

interface CorrelationResult {
  walletAddress: string;
  metrics: CorrelationMetrics;
  relatedEvents: Array<{
    eventId: string;
    confidence: number;
    reason: string;
  }>;
}

export class EventCorrelationAgent
  implements BaseAgent<string, CorrelationResult>
{
  public readonly name = "EventCorrelation";
  public readonly description = "Correlate DEX trades with external events";
  protected readonly _agent: Agent;

  constructor() {
    this._agent = new Agent({
      name: this.name,
      model: {
        provider: "OPEN_AI",
        name: "gpt-4o-mini",
      },
      description: this.description,
      tools: {
        analyzeTrades: createTool({
          id: "analyze-trades",
          description: "Analyze trading patterns and correlate with events",
          schema: z.object({
            walletAddress: z.string(),
            startTime: z.number().optional(),
            endTime: z.number().optional(),
          }),
          execute: async (params) => {
            const metrics = await this.analyzeTradingPatterns(
              params.walletAddress,
              params.startTime,
              params.endTime
            );
            return JSON.stringify(metrics);
          },
        }),
      },
    });
  }

  private async analyzeTradingPatterns(
    walletAddress: string,
    startTime?: number,
    endTime?: number
  ): Promise<CorrelationMetrics> {
    const query: any = { walletAddress: walletAddress.toLowerCase() };
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }

    const trades = await DexTradeModel.find(query).sort({ timestamp: 1 });

    if (!trades.length) {
      throw new Error("No trades found for analysis");
    }

    // Calculate metrics
    const metrics: CorrelationMetrics = {
      totalValue: 0,
      tradeCount: trades.length,
      averageTradeValue: 0,
      largestTrade: 0,
      tokenPairs: [],
      timeAnalysis: {
        startTime: trades[0].timestamp,
        endTime: trades[trades.length - 1].timestamp,
        averageTimeBetweenTrades: 0,
      },
    };

    // Token pair analysis
    const pairMap = new Map<string, number>();

    trades.forEach((trade, index) => {
      // Value analysis
      const tradeValue = trade.tokenIn.valueUSD || 0;
      metrics.totalValue += tradeValue;
      metrics.largestTrade = Math.max(metrics.largestTrade, tradeValue);

      // Token pair analysis
      const pairKey = `${trade.tokenIn.symbol}-${trade.tokenOut.symbol}`;
      pairMap.set(pairKey, (pairMap.get(pairKey) || 0) + 1);

      // Time analysis
      if (index > 0) {
        const timeDiff = trade.timestamp - trades[index - 1].timestamp;
        metrics.timeAnalysis.averageTimeBetweenTrades += timeDiff;
      }
    });

    // Finalize calculations
    metrics.averageTradeValue = metrics.totalValue / metrics.tradeCount;
    metrics.timeAnalysis.averageTimeBetweenTrades /= metrics.tradeCount - 1;

    // Convert token pairs map to array
    metrics.tokenPairs = Array.from(pairMap.entries()).map(([pair, count]) => {
      const [tokenIn, tokenOut] = pair.split("-");
      return { tokenIn, tokenOut, count };
    });

    return metrics;
  }

  private async findCorrelatedEvents(metrics: CorrelationMetrics): Promise<
    Array<{
      eventId: string;
      confidence: number;
      reason: string;
    }>
  > {
    const events = await RelatedEventModel.find({
      timestamp: {
        $gte: metrics.timeAnalysis.startTime - 24 * 60 * 60 * 1000,
        $lte: metrics.timeAnalysis.endTime + 24 * 60 * 60 * 1000,
      },
    }).lean();

    const correlations = [];

    for (const event of events) {
      // Add type assertion
      const eventDoc = event as {
        _id: { toString(): string };
        timestamp: number;
      };
      const timeDiff = Math.abs(
        eventDoc.timestamp - metrics.timeAnalysis.startTime
      );
      const timeProximity = Math.max(0, 1 - timeDiff / (24 * 60 * 60 * 1000));

      // Calculate value significance
      const valueSignificance = metrics.totalValue > 10000 ? 0.8 : 0.4;

      // Calculate trading intensity
      const tradingIntensity = metrics.tradeCount > 5 ? 0.7 : 0.3;

      // Combined confidence score
      const confidence =
        (timeProximity + valueSignificance + tradingIntensity) / 3;

      if (confidence > 0.5) {
        correlations.push({
          eventId: eventDoc._id.toString(),
          confidence,
          reason: `High correlation based on temporal proximity (${timeProximity.toFixed(2)}) and trading volume`,
        });
      }
    }

    return correlations.sort((a, b) => b.confidence - a.confidence);
  }

  async run(walletAddress: string): Promise<CorrelationResult> {
    try {
      logger.info(`Starting event correlation for wallet: ${walletAddress}`);

      const result = await this._agent.tools.analyzeTrades.execute({
        walletAddress,
      });
      const metrics = JSON.parse(result) as CorrelationMetrics;
      const correlatedEvents = await this.findCorrelatedEvents(metrics);

      return {
        walletAddress,
        metrics,
        relatedEvents: correlatedEvents,
      };
    } catch (error) {
      logger.error("Event correlation failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        wallet: walletAddress,
      });
      throw error;
    }
  }

  public getAgent(): Agent {
    return this._agent;
  }
}
