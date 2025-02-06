import { Agent } from "@covalenthq/ai-agent-sdk";
import { createTool } from "@covalenthq/ai-agent-sdk";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTrade, DexTradeModel } from "@/models/DexTrade";
import logger from "@/services/logger";
import { z } from "zod";

interface StorageResponse {
  success: boolean;
  stored: number;
  updated?: number;
  new?: number;
  warning?: string;
  error?: string;
}

export class TradeStorageAgent
  implements BaseAgent<DexTrade[], { success: boolean; stored: number }>
{
  public readonly name = "TradeStorage";
  public readonly description = "Store validated DEX trades in database";
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
        storeTrades: createTool({
          id: "store-trades",
          description: "Store trades in MongoDB",
          schema: z.any(),
          execute: async (input: { trades: DexTrade[] }): Promise<string> => {
            const { trades } = input;
            logger.info(`Attempting to store ${trades.length} trades`);

            try {
              const operations = trades.map((trade) => ({
                updateOne: {
                  filter: { txHash: trade.txHash },
                  update: {
                    $setOnInsert: {
                      createdAt: new Date(),
                      expiresAt: new Date(
                        Date.now() + 365 * 24 * 60 * 60 * 1000
                      ),
                    },
                    $set: {
                      walletAddress: trade.walletAddress.toLowerCase(), // Normalize address
                      timestamp: trade.timestamp,
                      dex: trade.dex,
                      tokenIn: {
                        ...trade.tokenIn,
                        address: trade.tokenIn.address.toLowerCase(), // Normalize token address
                      },
                      tokenOut: {
                        ...trade.tokenOut,
                        address: trade.tokenOut.address.toLowerCase(), // Normalize token address
                      },
                    },
                  },
                  upsert: true,
                },
              }));

              const result = await DexTradeModel.bulkWrite(operations, {
                ordered: false,
              });

              const response: StorageResponse = {
                success: true,
                stored: result.upsertedCount + result.modifiedCount,
                updated: result.modifiedCount,
                new: result.upsertedCount,
              };

              logger.debug("Bulk write operation result", result);
              return JSON.stringify(response);
            } catch (error) {
              if (error instanceof Error && error.message.includes("E11000")) {
                logger.warn(
                  "Duplicate trades detected, some trades were skipped",
                  {
                    error: error.message,
                  }
                );
                const response: StorageResponse = {
                  success: true,
                  stored: 0,
                  warning: "Some trades were duplicates and were skipped",
                };
                return JSON.stringify(response);
              }

              logger.error("Storage operation failed", {
                error: error instanceof Error ? error.message : "Unknown error",
                trades: trades.map((t) => t.txHash),
              });

              const response: StorageResponse = {
                success: false,
                stored: 0,
                error: error instanceof Error ? error.message : "Unknown error",
              };
              return JSON.stringify(response);
            }
          },
        }),
      },
    });
  }

  public getAgent(): Agent {
    return this._agent;
  }

  async run(trades: DexTrade[]): Promise<{ success: boolean; stored: number }> {
    if (!trades?.length) {
      logger.warn("No trades provided for storage");
      return { success: true, stored: 0 };
    }

    logger.info(`Starting storage agent run with ${trades.length} trades`);

    try {
      const result = await this._agent.tools.storeTrades.execute({ trades });
      const parsedResult = JSON.parse(result) as StorageResponse;
      logger.info("Storage operation completed", parsedResult);
      return {
        success: parsedResult.success,
        stored: parsedResult.stored || 0,
      };
    } catch (error) {
      const errorMessage = `Storage failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
}
