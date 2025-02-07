import { Request, Response } from "express";
import mongoose from "mongoose";
import logger from "../../services/logger";
import { PipelineStatus, APIResponse } from "../types";

export class StatusController {
  private logger = logger;

  getPipelineStatus = async (
    req: Request,
    res: Response<APIResponse<PipelineStatus>>
  ): Promise<void> => {
    try {
      const status = await mongoose.connection
        .collection("pipeline_status")
        .findOne<
          PipelineStatus & { _id: mongoose.Types.ObjectId }
        >({}, { sort: { lastUpdated: -1 } });

      if (!status) {
        res.status(404).json({
          success: false,
          error: {
            code: "STATUS_NOT_FOUND",
            message: "Pipeline status not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...status,
          _id: status._id.toString(),
        } as PipelineStatus,
      });
    } catch (error) {
      this.logger.error("Failed to fetch pipeline status", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pipeline status",
        },
      });
    }
  };
}
