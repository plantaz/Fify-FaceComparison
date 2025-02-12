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
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }
  
  const rekognition = new RekognitionClient({ 
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

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

      const referenceImage = req.file?.buffer;
      if (!referenceImage) {
        return res.status(400).json({ error: "Reference image buffer not found" });
      }

      // Get the storage provider to fetch target images
      const provider = createStorageProvider(job.driveUrl);
      await provider.scanDirectory(job.driveUrl); // This sets the URL in the provider
      const images = await provider.getImages();

      // Compare faces in each image
      const results = await Promise.all(images.map(async (image, index) => {
        try {
          console.log(`Analyzing image ${index + 1}...`);
          const command = new CompareFacesCommand({
            SourceImage: { Bytes: referenceImage },
            TargetImage: { Bytes: image.buffer },
            SimilarityThreshold: 70
          });

          const response = await rekognition.send(command);
          console.log(`Image ${index + 1} analysis result:`, response);
          const bestMatch = response.FaceMatches?.[0];

          return {
            imageId: index + 1,
            similarity: bestMatch?.Similarity || 0,
            matched: !!bestMatch,
            url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` : undefined,
            driveUrl: `https://drive.google.com/file/d/${image.id}/view`
          };
        } catch (error) {
          console.error(`Face comparison error for image ${index + 1}:`, error);
          return {
            imageId: index + 1,
            similarity: 0,
            matched: false
          };
        }
      }));

      const updatedJob = await storage.updateScanJobResults(jobId, results);
      res.json(updatedJob);

    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}