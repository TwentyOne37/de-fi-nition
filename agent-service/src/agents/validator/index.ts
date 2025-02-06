import { Agent } from "@covalenthq/ai-agent-sdk";
import { createTool } from "@covalenthq/ai-agent-sdk";
import { z } from "zod";
import { BaseAgent } from "../interfaces/base-agent";
import { ValidationResult } from "../interfaces/validator.interface";
import { DexTrade } from "@/models/DexTrade";

export class TradeValidatorAgent
  implements BaseAgent<DexTrade[], ValidationResult>
{
  public readonly name = "TradeValidator";
  public readonly description = "Validate DEX trade data";
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
        validateTrades: createTool({
          id: "validate-trades",
          description: "Validate trade data structure and values",
          schema: z.array(z.any()),
          execute: async (trades: DexTrade[]) => {
            const validationResults = await this.validateTrades(trades);
            return JSON.stringify(validationResults);
          },
        }),
      },
    });
  }

  private async validateTrades(trades: DexTrade[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const validTrades: DexTrade[] = [];

    for (const trade of trades) {
      if (this.isValidTrade(trade)) {
        validTrades.push(trade);
      } else {
        errors.push(`Invalid trade: ${trade.txHash}`);
      }
    }

    return {
      valid: validTrades.length > 0,
      trades: validTrades,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private isValidTrade(trade: DexTrade): boolean {
    return (
      !!trade.blockHeight &&
      !!trade.timestamp &&
      !!trade.txHash &&
      !!trade.walletAddress &&
      !!trade.dex &&
      !!trade.tokenIn.address &&
      !!trade.tokenIn.symbol &&
      !!trade.tokenIn.amount &&
      !!trade.tokenOut.address &&
      !!trade.tokenOut.symbol &&
      !!trade.tokenOut.amount
    );
  }

  async run(trades: DexTrade[]): Promise<ValidationResult> {
    const result = await this._agent.run({
      agent: this.name,
      messages: [
        {
          role: "user",
          content: "Validate the provided DEX trades",
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
      return JSON.parse(lastMessage);
    } catch (error) {
      throw new Error(
        `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  public getAgent(): Agent {
    return this._agent;
  }
}
