export interface DexTrade {
  blockHeight: number;
  timestamp: number;
  txHash: string;
  walletAddress: string;
  dex: string;
  tokenIn: {
    address: string;
    symbol: string;
    amount: string;
  };
  tokenOut: {
    address: string;
    symbol: string;
    amount: string;
  };
}

export interface RelatedEvent {
  timestamp: number;
  source: string;
  title: string;
  url: string;
  summary: string;
  confidence: number;
}

export interface CollectorInput {
  walletAddress: string;
  startTime?: number;
  endTime?: number;
  chainId?: string;
}
