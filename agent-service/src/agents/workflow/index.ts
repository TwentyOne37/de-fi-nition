import { ZeeWorkflow } from "@covalenthq/ai-agent-sdk";
import { TradeCollectorAgent } from "../collector";
import { TradeValidatorAgent } from "../validator";
import { TradeStorageAgent } from "../storage";
import { CollectorInput } from "@/types";

export class DexTradeWorkflow {
  private workflow: ZeeWorkflow;

  constructor(
    private collector: TradeCollectorAgent,
    private validator: TradeValidatorAgent,
    private storage: TradeStorageAgent
  ) {
    this.workflow = new ZeeWorkflow({
      description: "Collect, validate and store DEX trades",
      output: "Processed DEX trades stored in database",
      agents: {
        collector: this.collector.getAgent(),
        validator: this.validator.getAgent(),
        storage: this.storage.getAgent(),
      },
    });
  }

  async execute(input: CollectorInput): Promise<{
    success: boolean;
    collected: number;
    validated: number;
    stored: number;
    errors?: string[];
  }> {
    try {
      // Collect trades
      const trades = await this.collector.run(input);

      // Validate trades
      const validationResult = await this.validator.run(trades);

      if (!validationResult.valid) {
        return {
          success: false,
          collected: trades.length,
          validated: 0,
          stored: 0,
          errors: validationResult.errors,
        };
      }

      // Store valid trades
      const storageResult = await this.storage.run(validationResult.trades);

      return {
        success: storageResult.success,
        collected: trades.length,
        validated: validationResult.trades.length,
        stored: storageResult.stored,
        errors: validationResult.errors,
      };
    } catch (error) {
      return {
        success: false,
        collected: 0,
        validated: 0,
        stored: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }
}
