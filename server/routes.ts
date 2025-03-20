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
      
      // Extract form values with minimal logging
      const awsAccessKeyId = req.body.awsAccessKeyId;
      const awsSecretAccessKey = req.body.awsSecretAccessKey;
      const googleApiKey = req.body.googleApiKey;
      const continuationToken = req.body.continuationToken;
      
      // Extremely simplified logging 
      console.log(`[API] ${continuationToken ? "Continuation" : "New"} analysis for job: ${jobId}`);

      // Lambda ultra-safe timeout (1 second to be extremely conservative)
      const startTime = Date.now();
      const SAFE_TIMEOUT = 1000; // Only 1 second to be ultra conservative

      // Trim credential strings
      const cleanAwsAccessKeyId = awsAccessKeyId?.trim();
      const cleanAwsSecretAccessKey = awsSecretAccessKey?.trim();
      const cleanGoogleApiKey = googleApiKey?.trim();
      
      // Check required credentials immediately
      if (!cleanGoogleApiKey) {
        return res.status(400).json({ error: "Google Drive API key is required" });
      }
      
      if (!cleanAwsAccessKeyId || !cleanAwsSecretAccessKey) {
        return res.status(400).json({ error: "AWS credentials are required" });
      }

      // Get job information
      const job = await storage.getScanJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Parse continuation token if present or initialize state
      let parsedToken = null;
      let results = [];
      let startIndex = 0;
      let referenceImageId = null;
      
      try {
        if (continuationToken) {
          parsedToken = JSON.parse(continuationToken);
          startIndex = parsedToken.nextIndex || 0;
          referenceImageId = parsedToken.referenceImageId;
          
          // For continuation requests, reuse existing results
          const existingJob = await storage.getScanJob(jobId);
          if (existingJob?.results && Array.isArray(existingJob.results)) {
            results = existingJob.results;
          }
        } else {
          // First request needs face image
          if (!req.file) {
            return res.status(400).json({ error: "No face image provided for initial request" });
          }
          
          // For initial requests, just store the reference image and return immediately
          referenceImageId = "reference";
          startIndex = 0;
        }
      } catch (tokenError) {
        console.error("[API] Error parsing continuation token:", tokenError);
        return res.status(400).json({ error: "Invalid continuation token format" });
      }
      
      // For the first request, just setup the initial state and return immediately
      if (!continuationToken) {
        // Create the storage provider to ensure we can count the files
        const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
        
        try {
          await provider.scanDirectory(job.driveUrl);
        } catch (scanError) {
          console.error("Error scanning directory:", scanError);
          return res.status(500).json({ error: "Failed to scan Google Drive directory" });
        }
        
        // Store the reference image for future requests
        // In a real implementation you might want to upload this to S3
        // For now just use a token to indicate the upload happened
        
        // Create continuation token for the first batch
        const initialToken = JSON.stringify({
          referenceImageId: referenceImageId,
          nextIndex: 0,
          jobId
        });
        
        // Initialize job with empty results
        await storage.updateScanJobResults(jobId, [], "processing");
        
        // Return the initialization status with token for next request
        return res.json({
          ...job,
          results: [],
          continuationToken: initialToken,
          processing: {
            total: job.imageCount, 
            processed: 0,
            isComplete: false,
            nextIndex: 0
          }
        });
      }
      
      // For continuation requests, process a SINGLE image per Lambda invocation
      
      // Create Rekognition client - do this AFTER checking timeout to avoid unnecessary setup
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.5) {
        console.log(`[API] Approaching time limit during setup`);
        
        // Return immediately with the same token
        return res.json({
          ...job,
          results,
          continuationToken,
          processing: {
            total: job.imageCount,
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
      // Setup the rekognition client
      const rekognition = new RekognitionClient({
        region: process.env.MY_AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: cleanAwsAccessKeyId,
          secretAccessKey: cleanAwsSecretAccessKey
        }
      });
      
      // Initialize provider
      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
      
      // Check if we're approaching timeout
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.7) {
        console.log(`[API] Approaching time limit before fetching images`);
        
        // Return with the same continuation token
        return res.json({
          ...job,
          results,
          continuationToken,
          processing: {
            total: job.imageCount,
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
      // Prepare the reference image
      let referenceImageBuffer: Buffer | null = null;
      
      if (referenceImageId === "reference") {
        // This is the uploaded file from the first request
        if (req.file && req.file.buffer) {
          referenceImageBuffer = req.file.buffer;
        } else {
          // Special case: we lost the reference but have the jobId
          // Implement a recovery mechanism here
          return res.status(400).json({ 
            error: "Reference image missing. Please restart the process." 
          });
        }
      }
      
      // Check if we've used too much time already
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.8) {
        console.log(`[API] Approaching time limit during reference image setup`);
        return res.json({
          ...job,
          results,
          continuationToken,
          processing: {
            total: job.imageCount,
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
      // Get an extremely small batch of images - just ONE image
      // Skip rescan and go directly to getImages which should be cached
      const imageToProcess = await provider.getSingleImage(startIndex);
      if (!imageToProcess) {
        return res.json({
          ...job,
          results,
          processing: {
            total: job.imageCount,
            processed: results.length,
            isComplete: true, // Mark as complete if we've processed all images
            nextIndex: startIndex
          }
        });
      }

      // Check if we're approaching timeout again
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.9) {
        console.log(`[API] Approaching time limit after image fetch`);
        return res.json({
          ...job,
          results,
          continuationToken,
          processing: {
            total: job.imageCount,
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
      // Ensure we have a valid reference image at this point
      if (!referenceImageBuffer) {
        return res.status(400).json({ 
          error: "Reference image buffer missing. Please restart the process." 
        });
      }
      
      try {
        // Process just this single image
        console.log(`Processing image ${startIndex + 1}/${job.imageCount}`);
        
        // Create face comparison command
        const command = new CompareFacesCommand({
          SourceImage: { Bytes: referenceImageBuffer },
          TargetImage: { Bytes: imageToProcess.buffer },
          SimilarityThreshold: 70,
        });
        
        // Send to Rekognition
        try {
          const response = await rekognition.send(command);
          const bestMatch = response.FaceMatches?.[0];
          
          // Add to results
          results.push({
            imageId: startIndex + 1,
            similarity: bestMatch?.Similarity || 0,
            matched: !!bestMatch,
            url: imageToProcess.id ? `https://lh3.googleusercontent.com/d/${imageToProcess.id}=s1000` : undefined,
            driveUrl: `https://drive.google.com/file/d/${imageToProcess.id}/view`,
          });
          
          // Save results immediately
          await storage.updateScanJobResults(jobId, results, "processing");
          
        } catch (rekognitionError) {
          console.error(`[API] AWS Rekognition error:`, 
            rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error'
          );
          
          // Add error result
          results.push({
            imageId: startIndex + 1,
            similarity: 0,
            matched: false,
            error: rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error',
            url: imageToProcess.id ? `https://lh3.googleusercontent.com/d/${imageToProcess.id}=s1000` : undefined,
            driveUrl: `https://drive.google.com/file/d/${imageToProcess.id}/view`,
          });
          
          // Still save the error result
          await storage.updateScanJobResults(jobId, results, "processing");
        }
      } catch (error) {
        console.error(`Face comparison error:`, error);
        results.push({
          imageId: startIndex + 1,
          similarity: 0,
          matched: false,
        });
        
        // Save progress even after errors
        await storage.updateScanJobResults(jobId, results, "processing");
      }
      
      // Create continuation token for next image
      const nextIndex = startIndex + 1;
      const isComplete = nextIndex >= job.imageCount;
      const nextToken = !isComplete ? JSON.stringify({
        referenceImageId: referenceImageId,
        nextIndex: nextIndex,
        jobId
      }) : null;
      
      // Update final status
      const finalStatus = isComplete ? "complete" : "processing";
      const updatedJob = await storage.updateScanJobResults(jobId, results, finalStatus);
      
      // Return response with continuation token if needed
      return res.json({
        ...updatedJob,
        continuationToken: nextToken,
        processing: {
          total: job.imageCount,
          processed: results.length,
          isComplete,
          nextIndex: nextIndex
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
