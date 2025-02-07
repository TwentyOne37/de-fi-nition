import { Request, Response } from "express";
import logger from "../../services/logger";
import { CollectionJob, ICollectionJob } from "../../models/CollectionJob";
import { CreateCollectionJobRequest, CollectionJobResponse } from "../types";
import { startCollectionJob } from "@/services/collection.service";
import { Document, Types } from "mongoose";

export class CollectionController {
  private logger = logger;

  constructor() {
    // Remove logger initialization
  }

  // Create new collection job
  createJob = async (
    req: Request<{}, {}, CreateCollectionJobRequest>,
    res: Response
  ): Promise<void> => {
    try {
      const { address, startDate, endDate } = req.body;

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_DATES",
            message: "Invalid date format",
          },
        });
        return;
      }

      // Create job record
      const job = new CollectionJob({
        address,
        startDate: start,
        endDate: end,
        status: "queued",
      });
      await job.save();

      // Start collection process in background
      startCollectionJob((job._id as { toString(): string }).toString()).catch(
        (error) => {
          this.logger.error(
            `Failed to start collection job ${job._id}:`,
            error
          );
        }
      );

      res.status(201).json({
        success: true,
        data: this.formatJobResponse(
          job as Document<Types.ObjectId, {}, ICollectionJob> & ICollectionJob
        ),
      });
    } catch (error) {
      this.logger.error("Failed to create collection job:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create collection job",
        },
      });
    }
  };

  // Get job status
  getJobStatus = async (
    req: Request<{ jobId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const job = await CollectionJob.findById(req.params.jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: {
            code: "JOB_NOT_FOUND",
            message: "Collection job not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: this.formatJobResponse(
          job as Document<Types.ObjectId, {}, ICollectionJob> & ICollectionJob
        ),
      });
    } catch (error) {
      this.logger.error("Failed to fetch job status:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch job status",
        },
      });
    }
  };

  // Get all jobs for an address
  getAddressJobs = async (
    req: Request<{ address: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const jobs = await CollectionJob.find({
        address: req.params.address,
      }).sort({ createdAt: -1 });

      res.json({
        success: true,
        data: jobs.map((job) =>
          this.formatJobResponse(
            job as Document<Types.ObjectId, {}, ICollectionJob> & ICollectionJob
          )
        ),
      });
    } catch (error) {
      this.logger.error("Failed to fetch address jobs:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch address jobs",
        },
      });
    }
  };

  private formatJobResponse(
    job: Document<Types.ObjectId, {}, ICollectionJob> & ICollectionJob
  ): CollectionJobResponse {
    return {
      jobId: job._id.toString(),
      address: job.address,
      status: job.status,
      progress: {
        currentDate: job.progress.lastProcessedDate?.toISOString() || "",
        tradesCollected: job.progress.tradesCollected,
        tradesProcessed: job.progress.tradesProcessed,
        eventsCollected: job.progress.eventsCollected,
      },
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      // Add the full date range for context
      startDate: job.startDate.toISOString(),
      endDate: job.endDate.toISOString(),
    };
  }
}
