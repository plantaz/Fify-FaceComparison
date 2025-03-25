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
      
      // Parse the URL but make GoogleApiKey optional
      const { url, googleApiKey } = driveUrlSchema
        .extend({
          googleApiKey: z.string().optional(),
        })
        .parse(req.body);

      const driveType = "gdrive";

      // Check if environment variables are set
      const hasEnvGoogleApiKey = !!process.env.GOOGLE_DRIVE_API_KEY;
      const hasEnvAwsAccessKeyId = !!process.env.FIFY_AWS_ACCESS_KEY;
      const hasEnvAwsSecretAccessKey = !!process.env.FIFY_AWS_SECRET_KEY;
      
      // Use environment variables if available, otherwise use the provided values
      const apiKey = hasEnvGoogleApiKey ? process.env.GOOGLE_DRIVE_API_KEY : googleApiKey;
      console.log("Using API key from:", hasEnvGoogleApiKey ? "environment variable" : "request body");

      if (!apiKey) {
        throw new Error("Google Drive API key not configured. Please add it to environment variables or provide it in the request.");
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

        return res.json({
          ...job,
          hasEnvGoogleApiKey,
          hasEnvAwsCredentials: hasEnvAwsAccessKeyId && hasEnvAwsSecretAccessKey
        });
      } catch (error) {
        console.error("Error scanning directory:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error processing scan request:", error);
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
      
      // Simplified logging 
      console.log(`[API] ${continuationToken ? "Continuation" : "New"} analysis for job: ${jobId}`);

      // Lambda safe timeout (4 seconds is very conservative to prevent issues)
      const startTime = Date.now();
      const SAFE_TIMEOUT = 4000; // 4 seconds for a smaller batch size

      // Check if environment variables are set
      const hasEnvGoogleApiKey = !!process.env.GOOGLE_DRIVE_API_KEY;
      const hasEnvAwsAccessKeyId = !!process.env.FIFY_AWS_ACCESS_KEY;
      const hasEnvAwsSecretAccessKey = !!process.env.FIFY_AWS_SECRET_KEY;

      // Trim credential strings
      const cleanAwsAccessKeyId = hasEnvAwsAccessKeyId 
        ? process.env.FIFY_AWS_ACCESS_KEY 
        : awsAccessKeyId?.trim();
      const cleanAwsSecretAccessKey = hasEnvAwsSecretAccessKey 
        ? process.env.FIFY_AWS_SECRET_KEY 
        : awsSecretAccessKey?.trim();
      const cleanGoogleApiKey = hasEnvGoogleApiKey 
        ? process.env.GOOGLE_DRIVE_API_KEY 
        : googleApiKey?.trim();
      
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
            
            // Log the current results length to debug duplication issue
            console.log(`[API] Existing results count: ${results.length}`);
            
            // Check for duplicate results by comparing imageId
            const uniqueImageIds = new Set();
            const uniqueResults = [];
            
            for (const result of results) {
              if (!uniqueImageIds.has(result.imageId)) {
                uniqueImageIds.add(result.imageId);
                uniqueResults.push(result);
              } else {
                console.log(`[API] Found duplicate result for imageId: ${result.imageId}`);
              }
            }
            
            if (results.length !== uniqueResults.length) {
              console.log(`[API] Removed ${results.length - uniqueResults.length} duplicate results. New count: ${uniqueResults.length}`);
              // Use the deduplicated results
              results = uniqueResults;
              
              // Update the storage with deduplicated results
              await storage.updateScanJobResults(jobId, uniqueResults, existingJob.status);
            }
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
          const imageCount = await provider.scanDirectory(job.driveUrl);
          console.log(`[API] Found ${imageCount} images in the directory`);
          
          // Update the job record with the correct image count
          await storage.updateJobImageCount(jobId, imageCount);
          
          job.imageCount = imageCount; // Update local reference too
        } catch (scanError) {
          console.error("Error scanning directory:", scanError);
          return res.status(500).json({ error: "Failed to scan Google Drive directory" });
        }
        
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
      
      // Create Rekognition client
      const rekognition = new RekognitionClient({
        region: process.env.MY_AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: cleanAwsAccessKeyId,
          secretAccessKey: cleanAwsSecretAccessKey
        }
      });
      
      // Initialize provider
      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
      
      // Prepare the reference image
      let referenceImageBuffer: Buffer | null = null;
      
      if (referenceImageId === "reference") {
        // This is the uploaded file from the first request
        if (req.file && req.file.buffer) {
          referenceImageBuffer = req.file.buffer;
        } else {
          // Special case: we lost the reference but have the jobId
          return res.status(400).json({ 
            error: "Reference image missing. Please restart the process." 
          });
        }
      }
      
      // Check if we've used too much time already
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.2) {
        console.log(`[API] Approaching time limit during setup`);
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
      
      // Process 2 images per batch for faster processing with less risk of timeout
      const BATCH_SIZE = 2;
      
      // Fetch multiple images in parallel for better performance
      console.log(`Fetching batch of ${BATCH_SIZE} images starting from index ${startIndex}`);
      const imagesBatch = await provider.getImageBatch(startIndex, BATCH_SIZE);
      
      // If we couldn't fetch any images, check if we've reached the end
      if (imagesBatch.length === 0) {
        // Final deduplicate before marking as complete
        const finalUniqueImageIds = new Set();
        const finalUniqueResults = [];
        
        for (const result of results) {
          if (!finalUniqueImageIds.has(result.imageId)) {
            finalUniqueImageIds.add(result.imageId);
            finalUniqueResults.push(result);
          }
        }
        
        if (results.length !== finalUniqueResults.length) {
          console.log(`[API] Final deduplication - removed ${results.length - finalUniqueResults.length} duplicates`);
          results = finalUniqueResults;
          await storage.updateScanJobResults(jobId, finalUniqueResults, "complete");
        }
        
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
      
      // Process each image in the batch
      const newResults = []; // Track new results separately to avoid duplication
      
      for (const image of imagesBatch) {
        // Check if we're approaching timeout
        if (Date.now() - startTime > SAFE_TIMEOUT * 0.8) {
          console.log(`[API] Approaching time limit during processing, stopping before index ${image.index}`);
          
          // Add new results to the existing results array, avoiding duplicates
          for (const newResult of newResults) {
            // Check if this result already exists by imageId
            const existingIndex = results.findIndex(r => r.imageId === newResult.imageId);
            if (existingIndex === -1) {
              results.push(newResult);
            } else {
              // Replace existing result if needed
              results[existingIndex] = newResult;
            }
          }
          
          // Save results and return with continuation token for remaining images
          await storage.updateScanJobResults(jobId, results, "processing");
          
          const nextToken = JSON.stringify({
            referenceImageId: referenceImageId,
            nextIndex: image.index,
            jobId
          });
          
          return res.json({
            ...job,
            results,
            continuationToken: nextToken,
            processing: {
              total: job.imageCount,
              processed: results.length,
              isComplete: false,
              nextIndex: image.index
            }
          });
        }
        
        // Check if we've already processed this image (avoid duplicates)
        const alreadyProcessedIndex = results.findIndex(r => r.imageId === (image.index as number) + 1);
        if (alreadyProcessedIndex !== -1) {
          console.log(`[API] Skipping already processed image ${(image.index as number) + 1}`);
          continue;
        }
        
        try {
          const imageIndex = image.index as number;
          console.log(`Processing image ${imageIndex + 1}/${job.imageCount}`);
          
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
            
            // Add to new results array
            newResults.push({
              imageId: imageIndex + 1,
              similarity: bestMatch?.Similarity || 0,
              matched: !!bestMatch,
              url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` : undefined,
              driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
            });
            
          } catch (rekognitionError) {
            console.error(`[API] AWS Rekognition error for image ${imageIndex + 1}:`, 
              rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error'
            );
            
            // Add error result to new results array
            newResults.push({
              imageId: imageIndex + 1,
              similarity: 0,
              matched: false,
              error: rekognitionError instanceof Error ? rekognitionError.message : 'Unknown error',
              url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=s1000` : undefined,
              driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
            });
          }
          
        } catch (error) {
          const imageIndex = image.index as number;
          console.error(`Face comparison error for image ${imageIndex + 1}:`, error);
          
          // Add error result to new results array
          newResults.push({
            imageId: imageIndex + 1,
            similarity: 0,
            matched: false,
          });
        }
      }
      
      // Merge new results with existing results, ensuring no duplicates
      for (const newResult of newResults) {
        // Check if this result already exists by imageId
        const existingIndex = results.findIndex(r => r.imageId === newResult.imageId);
        if (existingIndex === -1) {
          results.push(newResult);
        } else {
          // Replace existing result with new one
          results[existingIndex] = newResult;
        }
      }
      
      // Save all results at once after processing the batch
      await storage.updateScanJobResults(jobId, results, "processing");
      
      // Calculate the next index based on what we actually processed
      const lastProcessedIndex = imagesBatch.length > 0 
        ? Math.max(...imagesBatch.map(img => (img.index as number))) + 1 
        : startIndex;
      
      const isComplete = lastProcessedIndex >= job.imageCount;
      const nextToken = !isComplete ? JSON.stringify({
        referenceImageId: referenceImageId,
        nextIndex: lastProcessedIndex,
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
          nextIndex: lastProcessedIndex
        }
      });
      
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add endpoint to get job details with environment variable information
  app.get("/api/jobs/:jobId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getScanJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Check if environment variables are set
      const hasEnvGoogleApiKey = !!process.env.GOOGLE_DRIVE_API_KEY;
      const hasEnvAwsAccessKeyId = !!process.env.FIFY_AWS_ACCESS_KEY;
      const hasEnvAwsSecretAccessKey = !!process.env.FIFY_AWS_SECRET_KEY;
      
      return res.json({
        ...job,
        hasEnvGoogleApiKey,
        hasEnvAwsCredentials: hasEnvAwsAccessKeyId && hasEnvAwsSecretAccessKey
      });
    } catch (error) {
      console.error("Error getting job:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Add an environment check endpoint
  app.get("/api/env-check", (req, res) => {
    const envStatus = {
      googleApiKey: !!process.env.GOOGLE_DRIVE_API_KEY,
      awsAccessKeyId: !!process.env.FIFY_AWS_ACCESS_KEY, 
      awsSecretAccessKey: !!process.env.FIFY_AWS_SECRET_KEY,
      myAwsRegion: process.env.MY_AWS_REGION || "us-east-1"
    };
    
    console.log("Environment check requested:", envStatus);
    return res.json(envStatus);
  });

  // Return empty for serverless compatibility
  return;
}
