// src/agents/collector/index.ts
import { Agent } from "@covalenthq/ai-agent-sdk";
import { GoldRushClient } from "@covalenthq/client-sdk";
import { createTool } from "@covalenthq/ai-agent-sdk";
import { z } from "zod";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTrade, CollectorInput } from "../../types";
import { BASE_DEX_ADDRESSES } from "@/config/dex/base";

export class TradeCollectorAgent implements BaseAgent {
  private agent: Agent;
  private goldRushClient: GoldRushClient;
  public readonly name = "TradeCollector";
  public readonly description = "Collect DEX trades from Base chain";

  constructor(apiKey: string) {
    this.goldRushClient = new GoldRushClient(apiKey);

    this.agent = new Agent({
      name: this.name,
      model: {
        provider: "OPEN_AI",
        name: "gpt-4o-mini",
      },
      description: this.description,
      tools: {
        fetchDexTrades: createTool({
          id: "fetch-dex-trades",
          description: "Fetch and format DEX trades",
          schema: z.object({
            walletAddress: z.string(),
            startTime: z.number().optional(),
            endTime: z.number().optional(),
          }),
          execute: async (params) => {
            try {
              const txs =
                await this.goldRushClient.TransactionService.getAllTransactionsForAddressByPage(
                  "base-mainnet",
                  params.walletAddress,
                  {
                    noLogs: false,
                    blockSignedAtAsc: true,
                  }
                );

              const trades = this.transformTrades(txs?.data?.items || []);
              // Tool must return string
              return JSON.stringify({ success: true, trades });
            } catch (error) {
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

  private isDexTransaction(tx: any): boolean {
    const dexAddresses = [
      BASE_DEX_ADDRESSES.uniswapV3.router.toLowerCase(),
      BASE_DEX_ADDRESSES.aerodrome.router.toLowerCase(),
    ];
    return dexAddresses.includes(tx.to_address.toLowerCase());
  }

  private identifyDex(tx: any): string {
    const toAddress = tx.to_address.toLowerCase();

    if (toAddress === BASE_DEX_ADDRESSES.uniswapV3.router.toLowerCase()) {
      return "uniswap_v3";
    }

    if (toAddress === BASE_DEX_ADDRESSES.aerodrome.router.toLowerCase()) {
      return "aerodrome";
    }

    return "unknown";
  }

  private extractTokenIn(tx: any): {
    address: string;
    symbol: string;
    amount: string;
  } {
    // Basic implementation looking at decoded logs
    const logs = tx.log_events || [];

    for (const log of logs) {
      // Check for Transfer event to router (indicates token in)
      if (
        log.decoded?.name === "Transfer" &&
        log.decoded?.params &&
        log.decoded.params[1]?.value?.toLowerCase() ===
          tx.to_address.toLowerCase()
      ) {
        return {
          address: log.sender_address,
          symbol: log.sender_contract_ticker_symbol || "UNKNOWN",
          amount: log.decoded.params[2]?.value || "0",
        };
      }
    }

    // If no token transfer found, might be native ETH
    if (tx.value && tx.value !== "0") {
      return {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        amount: tx.value,
      };
    }

    return {
      address: "",
      symbol: "",
      amount: "0",
    };
  }

  private extractTokenOut(tx: any): {
    address: string;
    symbol: string;
    amount: string;
  } {
    const logs = tx.log_events || [];

    for (const log of logs) {
      // Check for Transfer event from router (indicates token out)
      if (
        log.decoded?.name === "Transfer" &&
        log.decoded?.params &&
        log.decoded.params[0]?.value?.toLowerCase() ===
          tx.to_address.toLowerCase()
      ) {
        return {
          address: log.sender_address,
          symbol: log.sender_contract_ticker_symbol || "UNKNOWN",
          amount: log.decoded.params[2]?.value || "0",
        };
      }
    }

    return {
      address: "",
      symbol: "",
      amount: "0",
    };
  }

  private transformTrades(txs: any[]): DexTrade[] {
    return txs
      .filter((tx) => this.isDexTransaction(tx))
      .map((tx) => {
        const tokenIn = this.extractTokenIn(tx);
        const tokenOut = this.extractTokenOut(tx);

        // Only include transactions where we successfully identified both tokens
        if (!tokenIn.address || !tokenOut.address) {
          return null;
        }

        return {
          blockHeight: tx.block_height,
          timestamp: new Date(tx.block_signed_at).getTime(),
          txHash: tx.tx_hash,
          walletAddress: tx.from_address,
          dex: this.identifyDex(tx),
          tokenIn,
          tokenOut,
        };
      })
      .filter((trade): trade is DexTrade => trade !== null);
  }

  async run(input: CollectorInput): Promise<DexTrade[]> {
    const result = await this.agent.run({
      agent: this.name,
      messages: [
        {
          role: "user",
          content: "Fetch DEX trades for the given wallet",
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
      const toolResult = JSON.parse(lastMessage);
      if (!toolResult.success) {
        throw new Error(toolResult.error);
      }
      return toolResult.trades;
    } catch (error) {
      throw new Error(
        `Failed to process trades: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
