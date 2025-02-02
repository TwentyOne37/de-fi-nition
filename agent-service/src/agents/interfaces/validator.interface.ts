import { DexTrade } from "@/models/DexTrade";

export interface ValidationResult {
  valid: boolean;
  trades: DexTrade[];
  errors?: string[];
}
