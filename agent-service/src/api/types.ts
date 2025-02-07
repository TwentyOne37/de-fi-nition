export interface PipelineStatus {
  currentBatch: {
    id: string;
    startTime: Date;
    status: "idle" | "processing" | "completed" | "failed";
  };
  statistics: {
    totalBatchesProcessed: number;
    totalTradesCollected: number;
    totalTradesStored: number;
    totalTradesEnriched: number;
    totalEventsCollected: number;
  };
  lastUpdated: Date;
  errors?: {
    message: string;
    timestamp: Date;
    component: string;
  }[];
}

export interface APIError {
  code: string;
  message: string;
  details?: unknown;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
}

export interface CreateCollectionJobRequest {
  address: string;
  startDate: string;
  endDate: string;
}

export interface CollectionJobResponse {
  jobId: string;
  address: string;
  status: string;
  progress: {
    currentDate: string;
    tradesCollected: number;
    tradesProcessed: number;
    eventsCollected: number;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
  startDate: string;
  endDate: string;
}
