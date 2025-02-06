import { DexTrade } from "@/models/DexTrade";
import { TradeCollectorAgent } from "../agents/collector";
import logger from "../services/logger";
import config from "@/config";

const DECIMALS: Record<string, number> = {
  USDC: 6,
  WETH: 18,
  // Add other tokens as needed
} as const;

const formatAmount = (amount: string, symbol: string): string => {
  const decimals = DECIMALS[symbol as keyof typeof DECIMALS] || 18;
  const num = Number(amount) / Math.pow(10, decimals);

  if (num > 1e9) return `${(num / 1e9).toFixed(2)}B ${symbol}`;
  if (num > 1e6) return `${(num / 1e6).toFixed(2)}M ${symbol}`;
  if (num > 1e3) return `${(num / 1e3).toFixed(2)}K ${symbol}`;
  return `${num.toFixed(4)} ${symbol}`; // 4 decimals for small numbers
};

async function main() {
  try {
    logger.info("Creating collector agent...");
    const collector = new TradeCollectorAgent(config.COVALENT_API_KEY);

    const testWallet = "0xf1D3d73a34f917291cDdf07fE7c8bE874c55EC16";
    logger.info(`Fetching trades for wallet: ${testWallet}`);

    const trades = await collector.run({
      walletAddress: testWallet,
      startTime: Date.now() - 24 * 60 * 60 * 1000,
    });

    const tradesByDex = trades.reduce(
      (acc, trade) => {
        acc[trade.dex] = acc[trade.dex] || [];
        acc[trade.dex].push(trade);
        return acc;
      },
      {} as Record<string, DexTrade[]>
    );

    console.log("\n=== Trade Summary ===");
    console.log(`Total trades found: ${trades.length}\n`);

    Object.entries(tradesByDex).forEach(([dex, dexTrades]) => {
      console.log(`${dex.toUpperCase()} Trades (${dexTrades.length}):`);
      dexTrades.slice(-10).forEach((trade) => {
        console.log(
          `  ${new Date(trade.timestamp).toISOString().split("T")[0]} | ` +
            `${formatAmount(trade.tokenIn.amount, trade.tokenIn.symbol)} → ` +
            `${formatAmount(trade.tokenOut.amount, trade.tokenOut.symbol)}`
        );
      });
      console.log(); // Empty line between DEXes
    });

    process.exit(0);
  } catch (error) {
    logger.error("Error fetching trades", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
