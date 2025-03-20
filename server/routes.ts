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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export function registerRoutes(app: Express): void {
  app.post("/api/scan", async (req, res) => {
    try {
      console.log("Received /api/scan request with body:", {
        url: req.body.url,
        hasGoogleApiKey: !!req.body.googleApiKey
      });
      
      const { url, googleApiKey } = driveUrlSchema
        .extend({
          googleApiKey: z.string().optional(),
        })
        .parse(req.body);

      const driveType = "gdrive";

      const apiKey = googleApiKey || process.env.GOOGLE_DRIVE_API_KEY;
      console.log("Using API key:", apiKey ? "Present (not shown for security)" : "Missing");

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
      
      // Log all incoming request data for debugging
      console.log("[API] Analyze request body keys:", Object.keys(req.body));
      console.log("[API] File included:", !!req.file);
      
      const { awsAccessKeyId, awsSecretAccessKey, googleApiKey } = req.body;

      // Trim and clean up credential strings
      const cleanAwsAccessKeyId = awsAccessKeyId?.trim();
      const cleanAwsSecretAccessKey = awsSecretAccessKey?.trim();
      const cleanGoogleApiKey = googleApiKey?.trim();

      // Enhanced logging for request body and form data
      console.log("[API] AWS Access Key provided:", !!cleanAwsAccessKeyId);
      console.log("[API] AWS Secret Access Key provided:", !!cleanAwsSecretAccessKey);
      console.log("[API] Google API Key provided:", !!cleanGoogleApiKey);
      console.log("[API] Face image provided:", !!req.file);
      console.log("[API] AWS key length:", cleanAwsAccessKeyId?.length);
      console.log("[API] AWS secret length:", cleanAwsSecretAccessKey?.length);

      // Ensure the Google API key is provided
      if (!cleanGoogleApiKey) {
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

      // For Netlify, ALWAYS use the credentials from the form
      // Only use environment variables in development if form credentials are missing
      const credentials = {
        accessKeyId: cleanAwsAccessKeyId || (isDevelopment ? process.env.AWS_ACCESS_KEY_ID : null),
        secretAccessKey: cleanAwsSecretAccessKey || (isDevelopment ? process.env.AWS_SECRET_ACCESS_KEY : null)
      };

      // Log credentials to confirm they exist
      console.log("[API] AWS Credentials being used:", {
        accessKeyPresent: !!credentials.accessKeyId,
        accessKeyLength: credentials.accessKeyId?.length,
        secretKeyPresent: !!credentials.secretAccessKey,
        secretKeyLength: credentials.secretAccessKey?.length,
      });
      
      // Check AWS credentials more thoroughly
      if (!credentials.accessKeyId) {
        return res.status(400).json({ error: "AWS Access Key ID not provided" });
      }
      
      if (!credentials.secretAccessKey) {
        return res.status(400).json({ error: "AWS Secret Access Key not provided" });
      }

      const rekognition = new RekognitionClient({
        region: process.env.MY_AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      });

      console.log("[API] Created AWS Rekognition client with region:", process.env.MY_AWS_REGION || "us-east-1");

      const referenceImage = req.file.buffer;
      if (!referenceImage) {
        return res
          .status(400)
          .json({ error: "Reference image buffer not found" });
      }

      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
      await provider.scanDirectory(job.driveUrl);
      const images = await provider.getImages();
      
      console.log(`[API] Total images to process: ${images.length}`);
      
      // Process images in batches to avoid Lambda timeout
      const BATCH_SIZE = 20; // Process 20 images at a time
      const results = [];
      
      // Process images in batches
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        console.log(`[API] Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(images.length/BATCH_SIZE)}`);
        const imageBatch = images.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(
          imageBatch.map(
            async (image: { buffer: Buffer; id?: string }, batchIndex: number) => {
              const index = i + batchIndex;
              try {
                console.log(`Analyzing image ${index + 1}...`);
                const command = new CompareFacesCommand({
                  SourceImage: { Bytes: referenceImage },
                  TargetImage: { Bytes: image.buffer },
                  SimilarityThreshold: 70,
                });

                try {
                  console.log(`Sending AWS Rekognition request for image ${index + 1}`);
                  const response = await rekognition.send(command);
                  console.log(`AWS Rekognition response for image ${index + 1}:`, {
                    hasFaceMatches: !!response.FaceMatches?.length,
                    matchCount: response.FaceMatches?.length || 0,
                    firstMatchSimilarity: response.FaceMatches?.[0]?.Similarity || 0
                  });
                  
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
                } catch (rekognitionError) {
                  console.error(`[API] AWS Rekognition error for image ${index + 1}:`, 
                    rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error'
                  );
                  
                  // Include the full error details for debugging
                  if (rekognitionError instanceof Error) {
                    console.error("[API] Error details:", {
                      name: rekognitionError.name,
                      message: rekognitionError.message,
                      stack: rekognitionError.stack
                    });
                  }
                  
                  // Check for invalid token errors specifically
                  const errorMessage = rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error';
                  const isAuthError = errorMessage.includes('token') || errorMessage.includes('credentials') || 
                                      errorMessage.includes('auth') || errorMessage.includes('access key');
                  
                  // Return a result with error information
                  return {
                    imageId: index + 1,
                    similarity: 0,
                    matched: false,
                    error: errorMessage,
                    errorType: isAuthError ? 'auth_error' : 'processing_error',
                    url: image.id
                      ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` 
                      : undefined,
                    driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
                  };
                }
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
        
        // Add batch results to overall results
        results.push(...batchResults);
        
        // Store partial results in case the function times out later
        if (results.length % (BATCH_SIZE * 2) === 0 || i + BATCH_SIZE >= images.length) {
          console.log(`[API] Saving intermediate results after processing ${results.length} images`);
          await storage.updateScanJobResults(jobId, results);
        }
      }

      const updatedJob = await storage.updateScanJobResults(jobId, results);
      res.json(updatedJob);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Return empty for serverless compatibility
  return;
}
