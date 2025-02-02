// src/agents/interfaces/base-agent.ts
import { z } from "zod";
import { CollectorInput } from "@/types";
import { DexTrade } from "@/models/DexTrade";

export interface AgentMetadata {
  name: string;
  description: string;
  version?: string;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    startTime: number;
    endTime: number;
    processedItems: number;
  };
}

export interface BaseAgent {
  name: string;
  description: string;
  run(input: CollectorInput): Promise<DexTrade[]>;
}

// Example implementation of basic validation
export const baseValidateData = <T>(schema: z.ZodSchema<T>) => {
  return async (data: unknown): Promise<boolean> => {
    try {
      await schema.parseAsync(data);
      return true;
    } catch (error) {
      return false;
    }
  };
};
