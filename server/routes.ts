import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { driveUrlSchema } from "@shared/schema";
import { isDevelopment } from "@shared/config";
import { z } from "zod";
import multer from "multer";
import { createStorageProvider } from "./services/cloud-storage";
import {
  RekognitionClient,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export function registerRoutes(app: Express): Server {
  app.post("/api/scan", async (req, res) => {
    try {
      const { url, googleApiKey } = driveUrlSchema
        .extend({
          googleApiKey: isDevelopment ? z.string().optional() : z.string(),
        })
        .parse(req.body);

      const driveType = url.includes("onedrive") ? "onedrive" : "gdrive";

      const apiKey = isDevelopment
        ? process.env.GOOGLE_DRIVE_API_KEY
        : googleApiKey;

      if (!apiKey) {
        throw new Error("Google Drive API key not configured");
      }

      const provider = createStorageProvider(url, apiKey);
      try {
        const imageCount = await provider.scanDirectory(url);
        const job = await storage.createScanJob({
          driveUrl: url,
          driveType,
          imageCount,
          status: "pending",
          createdAt: new Date().toISOString(),
        });

        res.json(job);
      } catch (error) {
        console.error("Drive scanning error:", error);
        res.status(500).json({
          error: "Failed to scan drive directory",
          details: (error as Error).message,
        });
      }
    } catch (error) {
      console.error("Validation error:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/analyze/:jobId", upload.single("face"), async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const { awsAccessKeyId, awsSecretAccessKey, googleApiKey } = req.body;

      // Log the incoming request's body
      console.log("Request body:", req.body);

      // Ensure the Google API key is provided
      if (!googleApiKey) {
        return res
          .status(400)
          .json({ error: "Google Drive API key is required" });
      }

      const job = await storage.getScanJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No face image provided" });
      }

      const credentials = {
        accessKeyId: isDevelopment
          ? process.env.AWS_ACCESS_KEY_ID!
          : awsAccessKeyId,
        secretAccessKey: isDevelopment
          ? process.env.AWS_SECRET_ACCESS_KEY!
          : awsSecretAccessKey,
      };

      // Log credentials to confirm they exist
      console.log("Credentials:", credentials);

      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        return res.status(400).json({ error: "AWS credentials not provided" });
      }

      const rekognition = new RekognitionClient({
        region: "us-east-1",
        credentials,
      });

      const referenceImage = req.file.buffer;
      if (!referenceImage) {
        return res
          .status(400)
          .json({ error: "Reference image buffer not found" });
      }

      const provider = createStorageProvider(job.driveUrl, googleApiKey);
      await provider.scanDirectory(job.driveUrl);
      const images = await provider.getImages();

      const results = await Promise.all(
        images.map(
          async (image: { buffer: Buffer; id?: string }, index: number) => {
            try {
              console.log(`Analyzing image ${index + 1}...`);
              const command = new CompareFacesCommand({
                SourceImage: { Bytes: referenceImage },
                TargetImage: { Bytes: image.buffer },
                SimilarityThreshold: 70,
              });

              const response = await rekognition.send(command);
              const bestMatch = response.FaceMatches?.[0];

              return {
                imageId: index + 1,
                similarity: bestMatch?.Similarity || 0,
                matched: !!bestMatch,
                url: image.id
                  ? `https://lh3.googleusercontent.com/d/${image.id}=s1000`
                  : undefined,
                driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
              };
            } catch (error) {
              console.error(
                `Face comparison error for image ${index + 1}:`,
                error,
              );
              return {
                imageId: index + 1,
                similarity: 0,
                matched: false,
              };
            }
          },
        ),
      );

      const updatedJob = await storage.updateScanJobResults(jobId, results);
      res.json(updatedJob);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
