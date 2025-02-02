import { Request, Response, NextFunction } from "express";
import logger from "../services/logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public source?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error("Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      source: err.source,
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
