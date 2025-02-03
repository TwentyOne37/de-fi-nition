import { Agent } from "@covalenthq/ai-agent-sdk";
import { createTool } from "@covalenthq/ai-agent-sdk";
import { z } from "zod";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTrade, DexTradeModel } from "@/models/DexTrade";
import logger from "@/services/logger";

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
          schema: z.array(z.any()),
          execute: async (trades: DexTrade[]) => {
            logger.info(`Attempting to store ${trades.length} trades`);

            try {
              // Use bulkWrite with upsert to handle duplicates
              const operations = trades.map((trade) => {
                logger.debug(`Preparing trade for storage: ${trade.txHash}`);
                return {
                  updateOne: {
                    filter: { txHash: trade.txHash },
                    update: { $set: trade },
                    upsert: true,
                  },
                };
              });

              const result = await DexTradeModel.bulkWrite(operations, {
                ordered: false,
              });

              const response = {
                success: true,
                stored: result.upsertedCount + result.modifiedCount,
                updated: result.modifiedCount,
                new: result.upsertedCount,
              };

              logger.info("Storage operation completed", response);
              return JSON.stringify(response);
            } catch (error) {
              logger.error("Storage operation failed", {
                error: error instanceof Error ? error.message : "Unknown error",
                trades: trades.map((t) => t.txHash),
              });

              return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              });
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
    logger.info(`Starting storage agent run with ${trades.length} trades`);

    const result = await this._agent.run({
      agent: this.name,
      messages: [
        {
          role: "user",
          content: "Store the validated DEX trades",
        },
      ],
      status: "running",
      children: [],
    });

    try {
      const lastMessage = result.messages[result.messages.length - 1].content;
      if (typeof lastMessage !== "string") {
        throw new Error("Invalid message format");
      }
      const parsedResult = JSON.parse(lastMessage);
      logger.info("Storage agent run completed", parsedResult);
      return parsedResult;
    } catch (error) {
      const errorMessage = `Storage failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
}
