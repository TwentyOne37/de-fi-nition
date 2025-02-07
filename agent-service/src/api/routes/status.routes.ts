import { Router } from "express";
import { StatusController } from "../controllers/status.controller";

const router = Router();
const statusController = new StatusController();

router.get("/pipeline/status", statusController.getPipelineStatus);

export default router;
