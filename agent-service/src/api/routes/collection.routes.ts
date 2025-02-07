// src/api/routes/collection.routes.ts
import { Router } from "express";
import { CollectionController } from "../controllers/collection.controller";

const router = Router();
const controller = new CollectionController();

router.post("/collection/jobs", controller.createJob);
router.get("/collection/jobs/:jobId", controller.getJobStatus);
router.get("/collection/address/:address/jobs", controller.getAddressJobs);

export default router;
