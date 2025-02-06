// src/agents/collector/index.ts
import { GoldRushClient } from "@covalenthq/client-sdk";
import { BaseAgent } from "../interfaces/base-agent";
import { DexTrade, CollectorInput } from "../../types";
import { BASE_DEX_ADDRESSES, getAllDexRouters } from "@/config/dex/base";
import logger from "@/services/logger";
import { Agent } from "@covalenthq/ai-agent-sdk";

export class TradeCollectorAgent
  implements BaseAgent<CollectorInput, DexTrade[]>
{
  private goldRushClient: GoldRushClient;
  public readonly name = "TradeCollector";
  public readonly description = "Collect DEX trades from Base chain";
  protected readonly _agent: Agent;

  constructor(apiKey: string) {
    logger.info("Initializing TradeCollectorAgent");
    this._agent = new Agent({
      name: this.name,
      model: {
        provider: "OPEN_AI",
        name: "gpt-4o-mini",
      },
      description: this.description,
    });
    this.goldRushClient = new GoldRushClient(apiKey);
    logger.info("TradeCollectorAgent initialized");
  }

  public getAgent(): Agent {
    return this._agent;
  }

  private isDexTransaction(tx: any): boolean {
    const dexAddresses = getAllDexRouters();
    const isDex = dexAddresses.includes(tx.to_address?.toLowerCase());

    if (isDex) {
      logger.debug(`Found DEX transaction: ${tx.tx_hash}`);
    }

    return isDex;
  }

  private identifyDex(tx: any): string {
    const toAddress = tx.to_address.toLowerCase();

    if (
      [
        BASE_DEX_ADDRESSES.uniswapV3.router.toLowerCase(),
        BASE_DEX_ADDRESSES.uniswapV3.swapRouter02.toLowerCase(),
        BASE_DEX_ADDRESSES.uniswapV3.universalRouter.toLowerCase(),
      ].includes(toAddress)
    ) {
      return "uniswap_v3";
    }
    if (toAddress === BASE_DEX_ADDRESSES.aerodrome.router.toLowerCase()) {
      return "aerodrome";
    }
    if (toAddress === BASE_DEX_ADDRESSES.baseswap.router.toLowerCase()) {
      return "baseswap";
    }

    return "unknown";
  }

  private extractTokenIn(tx: any): {
    address: string;
    symbol: string;
    amount: string;
  } {
    logger.debug(`Extracting token in for transaction: ${tx.tx_hash}`);
    const logs = tx.log_events || [];

    for (const log of logs) {
      if (
        log.decoded?.name === "Transfer" &&
        log.decoded?.params &&
        log.decoded.params[1]?.value?.toLowerCase() ===
          tx.to_address.toLowerCase()
      ) {
        const token = {
          address: log.sender_address,
          symbol: log.sender_contract_ticker_symbol || "UNKNOWN",
          amount: log.decoded.params[2]?.value || "0",
        };
        logger.debug(`Found token in:`, token);
        return token;
      }
    }

    if (tx.value && tx.value !== "0") {
      const token = {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        amount: tx.value,
      };
      logger.debug(`Found native ETH as token in:`, token);
      return token;
    }

    logger.debug(`No token in found for transaction: ${tx.tx_hash}`);
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
    logger.debug(`Extracting token out for transaction: ${tx.tx_hash}`);
    const logs = tx.log_events || [];

    for (const log of logs) {
      if (
        log.decoded?.name === "Transfer" &&
        log.decoded?.params &&
        log.decoded.params[0]?.value?.toLowerCase() ===
          tx.to_address.toLowerCase()
      ) {
        const token = {
          address: log.sender_address,
          symbol: log.sender_contract_ticker_symbol || "UNKNOWN",
          amount: log.decoded.params[2]?.value || "0",
        };
        logger.debug(`Found token out:`, token);
        return token;
      }
    }

    logger.debug(`No token out found for transaction: ${tx.tx_hash}`);
    return {
      address: "",
      symbol: "",
      amount: "0",
    };
  }

  private transformTrades(txs: any[]): DexTrade[] {
    const dexTxs = txs.filter((tx) => this.isDexTransaction(tx));
    logger.info(
      `Processing ${dexTxs.length} DEX transactions out of ${txs.length} total transactions`
    );

    const trades = dexTxs
      .map((tx) => {
        const tokenIn = this.extractTokenIn(tx);
        const tokenOut = this.extractTokenOut(tx);

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

    logger.info(`Successfully processed ${trades.length} valid trades`);
    return trades;
  }

  async run(input: CollectorInput): Promise<DexTrade[]> {
    logger.info("Starting trade collection", input);

    try {
      const txs =
        await this.goldRushClient.TransactionService.getAllTransactionsForAddressByPage(
          "base-mainnet",
          input.walletAddress,
          {
            noLogs: false,
            blockSignedAtAsc: true,
          }
        );

      logger.debug("Raw response from GoldRush:", txs);

      if (!txs?.data?.items) {
        logger.error("Invalid response structure from GoldRush", { txs });
        throw new Error("Invalid response from blockchain data provider");
      }

      const trades = this.transformTrades(txs.data.items);
      logger.info(`Collection completed - found ${trades.length} trades`);

      return trades;
    } catch (error) {
      logger.error("Trade collection failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorObject: error,
        input,
      });
      throw new Error(
        `Failed to collect trades: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
