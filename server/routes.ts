import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { driveUrlSchema, insertScanJobSchema } from "@shared/schema";
import multer from "multer";
import { 
  RekognitionClient, 
  CompareFacesCommand 
} from "@aws-sdk/client-rekognition";
import { createStorageProvider } from "./services/cloud-storage";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export function registerRoutes(app: Express): Server {
  const rekognition = new RekognitionClient({ region: "us-east-1" });

  app.post("/api/scan", async (req, res) => {
    try {
      const { url } = driveUrlSchema.parse(req.body);
      const driveType = url.includes('onedrive') ? 'onedrive' : 'gdrive';

      // Create appropriate storage provider
      const provider = createStorageProvider(url);

      try {
        // Get actual image count from the drive
        const imageCount = await provider.scanDirectory(url);

        const job = await storage.createScanJob({
          driveUrl: url,
          driveType,
          imageCount,
          status: 'pending',
          createdAt: new Date().toISOString()
        });

        res.json(job);
      } catch (error) {
        console.error('Drive scanning error:', error);
        res.status(500).json({ 
          error: "Failed to scan drive directory",
          details: (error as Error).message
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/analyze/:jobId", upload.single('face'), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getScanJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No face image provided" });
      }

      // TODO: Actually analyze images - mocked for now
      const mockResults = Array.from({ length: job.imageCount }, (_, i) => ({
        imageId: i + 1,
        similarity: Math.random() * 100,
        matched: Math.random() > 0.7
      }));

      const updatedJob = await storage.updateScanJobResults(jobId, mockResults);
      res.json(updatedJob);

    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}