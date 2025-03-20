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
      
      // Extract form values
      const awsAccessKeyId = req.body.awsAccessKeyId;
      const awsSecretAccessKey = req.body.awsSecretAccessKey;
      const googleApiKey = req.body.googleApiKey;
      const continuationToken = req.body.continuationToken;
      
      console.log("[API] Continuation token present:", !!continuationToken);

      // Trim and clean up credential strings
      const cleanAwsAccessKeyId = awsAccessKeyId?.trim();
      const cleanAwsSecretAccessKey = awsSecretAccessKey?.trim();
      const cleanGoogleApiKey = googleApiKey?.trim();
      let parsedToken = null;
      
      // Parse the continuation token if present
      try {
        if (continuationToken) {
          parsedToken = JSON.parse(continuationToken);
          console.log("[API] Parsed token:", JSON.stringify(parsedToken));
        }
      } catch (tokenError) {
        console.error("[API] Error parsing continuation token:", tokenError);
      }

      // Enhanced logging for request body and form data
      console.log("[API] AWS Access Key provided:", !!cleanAwsAccessKeyId);
      console.log("[API] AWS Secret Access Key provided:", !!cleanAwsSecretAccessKey);
      console.log("[API] Google API Key provided:", !!cleanGoogleApiKey);
      console.log("[API] Parsed token:", !!parsedToken);
      console.log("[API] Face image provided:", !!req.file);

      // Ensure the Google API key is provided
      if (!cleanGoogleApiKey) {
        return res.status(400).json({ error: "Google Drive API key is required" });
      }

      const job = await storage.getScanJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Need the face image only for the first request
      if (!req.file && !parsedToken) {
        return res.status(400).json({ error: "No face image provided" });
      }

      // For Netlify, ALWAYS use the credentials from the form
      const credentials = {
        accessKeyId: cleanAwsAccessKeyId || (isDevelopment ? process.env.AWS_ACCESS_KEY_ID : null),
        secretAccessKey: cleanAwsSecretAccessKey || (isDevelopment ? process.env.AWS_SECRET_ACCESS_KEY : null)
      };
      
      // Check AWS credentials
      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        return res.status(400).json({ error: "AWS credentials are required" });
      }

      // Lambda safe timeout (8 seconds to be safe)
      const startTime = Date.now();
      const SAFE_TIMEOUT = 8000;
      
      // Create Rekognition client
      const rekognition = new RekognitionClient({
        region: process.env.MY_AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        }
      });

      // Get current state from storage or initialize new
      let results = [];
      let startIndex = 0;
      let referenceImageBuffer: Buffer | null = null;
      
      // Handle continuation from previous runs
      if (parsedToken) {
        // We have a continuation token, retrieve existing results
        const existingJob = await storage.getScanJob(jobId);
        if (existingJob?.results && Array.isArray(existingJob.results)) {
          results = existingJob.results;
          startIndex = parsedToken.nextIndex;
          
          // Get reference image from storage
          if (!parsedToken.referenceImageId) {
            return res.status(400).json({ error: "Reference image ID missing in continuation token" });
          }
          
          // Reference image will be fetched from Drive using the ID
          try {
            const imageUrl = `https://lh3.googleusercontent.com/d/${parsedToken.referenceImageId}=s400`;
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
              return res.status(400).json({ error: "Failed to fetch reference image" });
            }
            const arrayBuffer = await imageResponse.arrayBuffer();
            referenceImageBuffer = Buffer.from(arrayBuffer);
          } catch (error) {
            return res.status(400).json({ error: "Failed to load reference image: " + (error as Error).message });
          }
        }
      } else {
        // First request with the face image uploaded
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "Reference image buffer not found" });
        }
        referenceImageBuffer = req.file.buffer;
        
        // Store the reference image in Drive or wherever needed for future requests
        // For now, we'll just use a placeholder ID for demo
        parsedToken = { referenceImageId: "reference", nextIndex: 0 };
      }
      
      // Ensure we have a reference image buffer
      if (!referenceImageBuffer) {
        return res.status(400).json({ error: "Failed to load reference image" });
      }

      // Get or initialize provider
      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
      
      // Get image list (this will use smaller s400 versions)
      await provider.scanDirectory(job.driveUrl);
      const images = await provider.getImages();
      
      console.log(`[API] Total images: ${images.length}, starting from index: ${startIndex}`);
      
      // Process a small batch of images (max 5 per Lambda invocation)
      const BATCH_SIZE = 5;
      const endIndex = Math.min(startIndex + BATCH_SIZE, images.length);
      let isComplete = false;
      
      // Process each image in sequence until timeout approaches
      for (let i = startIndex; i < endIndex; i++) {
        // Check if we're approaching Lambda timeout
        if (Date.now() - startTime > SAFE_TIMEOUT) {
          console.log(`[API] Approaching time limit, stopping at index ${i}`);
          
          // Create continuation token for next batch
          const nextToken = JSON.stringify({
            referenceImageId: parsedToken.referenceImageId,
            nextIndex: i
          });
          
          // Save progress
          await storage.updateScanJobResults(jobId, results, "processing");
          
          // Return partial results with continuation token
          return res.json({
            ...job,
            results,
            continuationToken: nextToken,
            processing: {
              total: images.length,
              processed: results.length,
              isComplete: false,
              nextIndex: i
            }
          });
        }
        
        // Process the image
        try {
          const image = images[i];
          console.log(`Processing image ${i + 1}/${images.length}`);
          
          // Create face comparison command
          const command = new CompareFacesCommand({
            SourceImage: { Bytes: referenceImageBuffer },
            TargetImage: { Bytes: image.buffer },
            SimilarityThreshold: 70,
          });
          
          // Send to Rekognition
          try {
            const response = await rekognition.send(command);
            const bestMatch = response.FaceMatches?.[0];
            
            // Add to results
            results.push({
              imageId: i + 1,
              similarity: bestMatch?.Similarity || 0,
              matched: !!bestMatch,
              url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` : undefined,
              driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
            });
          } catch (rekognitionError) {
            console.error(`[API] AWS Rekognition error for image ${i + 1}:`, 
              rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error'
            );
            
            // Add error result
            results.push({
              imageId: i + 1,
              similarity: 0,
              matched: false,
              error: rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error',
              url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` : undefined,
              driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
            });
          }
        } catch (error) {
          console.error(`Face comparison error for image ${i + 1}:`, error);
          results.push({
            imageId: i + 1,
            similarity: 0,
            matched: false,
          });
        }
        
        // Save progress after each image
        if ((i - startIndex) % 2 === 1 || i === endIndex - 1) {
          await storage.updateScanJobResults(jobId, results, "processing");
        }
      }
      
      // Check if we've processed all images
      isComplete = endIndex >= images.length;
      
      // Create continuation token if not complete
      const nextToken = !isComplete ? JSON.stringify({
        referenceImageId: parsedToken.referenceImageId,
        nextIndex: endIndex
      }) : null;
      
      // Update final status
      const finalStatus = isComplete ? "complete" : "processing";
      const updatedJob = await storage.updateScanJobResults(jobId, results, finalStatus);
      
      // Return response with continuation token if needed
      return res.json({
        ...updatedJob,
        continuationToken: nextToken,
        processing: {
          total: images.length,
          processed: results.length,
          isComplete,
          nextIndex: endIndex
        }
      });
      
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add a new endpoint to check job status
  app.get("/api/jobs/:jobId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getScanJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(job);
    } catch (error) {
      console.error("Error fetching job status:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Return empty for serverless compatibility
  return;
}
