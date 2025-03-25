import { Express } from 'express';
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
import { CloudStorageProvider } from './services/cloud-storage';

interface DriveFile {
  id: string;
  name: string;
  index?: number;
  buffer?: Buffer;
}

interface ScanResult {
  imageId: number;
  similarity: number;
  matched: boolean;
  error?: string;
  url?: string;
  driveUrl?: string;
}

interface ScanJob {
  id: number;
  driveUrl: string;
  status: string;
  results: ScanResult[];
  imageCount: number;
  referenceImageId?: string;
  createdAt: string;
  driveType: string;
}

interface ContinuationToken {
  referenceImageId: string;
  nextIndex: number;
  jobId: number;
}

// Cache for directory scan results
interface DirectoryCache {
  imageCount: number;
  lastUpdated: number;
  driveUrl: string;
}

const directoryCache: Map<string, DirectoryCache> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

      // Lambda safe timeout (10 seconds for optimal batch processing)
      const startTime = Date.now();
      const SAFE_TIMEOUT = 10000; // 10 seconds
      const TIMEOUT_WARNING = 0.85; // Warn at 85% of timeout
      
      // Function to check if we're approaching timeout
      const isApproachingTimeout = () => {
        const elapsedMs = Date.now() - startTime;
        const isClose = elapsedMs > SAFE_TIMEOUT * TIMEOUT_WARNING;
        if (isClose) {
          console.log(`[API] Approaching timeout after ${elapsedMs}ms`);
        }
        return isClose;
      };

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

      // Initialize provider early to reuse
      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);

      // Check directory cache or scan if needed
      const cacheKey = `${job.driveUrl}`;
      const cachedDir = directoryCache.get(cacheKey);
      let imageCount = job.imageCount;

      if (!cachedDir || (Date.now() - cachedDir.lastUpdated > CACHE_TTL)) {
        try {
          console.log(`[API] Cache miss or expired, scanning directory`);
          imageCount = await provider.scanDirectory(job.driveUrl);
          directoryCache.set(cacheKey, {
            imageCount,
            lastUpdated: Date.now(),
            driveUrl: job.driveUrl
          });
          
          // Update job if count changed
          if (imageCount !== job.imageCount) {
            await storage.updateJobImageCount(jobId, imageCount);
            job.imageCount = imageCount;
          }
        } catch (error) {
          console.error("Error scanning directory:", error);
          // Use existing count if scan fails
          console.log(`[API] Using existing image count: ${imageCount}`);
        }
      } else {
        console.log(`[API] Using cached directory info, count: ${cachedDir.imageCount}`);
        imageCount = cachedDir.imageCount;
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
      
      // Process 10 images per batch for optimal performance (increased from 6)
      const BATCH_SIZE = 10;
      const IMAGE_SIZE = 's600'; // Reduced from s1000 to s600 for faster downloads while maintaining quality
      
      // Fetch multiple images in parallel for better performance
      console.log(`[API] Fetching batch of ${BATCH_SIZE} images starting from index ${startIndex}`);
      const imagesBatch = await provider.getImageBatch(startIndex, BATCH_SIZE, IMAGE_SIZE);
      
      // Process each image in the batch
      const newResults = [];
      const batchStartTime = Date.now();
      
      // Create Rekognition client with optimized settings
      const rekognition = new RekognitionClient({
        region: process.env.MY_AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: cleanAwsAccessKeyId,
          secretAccessKey: cleanAwsSecretAccessKey
        },
        maxAttempts: 2 // Reduce retry attempts for faster failure
      });

      // Process images in parallel with controlled concurrency
      const processingPromises = imagesBatch.map(async (image) => {
        if (!referenceImageBuffer) return null;
        
        try {
          const imageIndex = image.index as number;
          console.log(`[API] Processing image ${imageIndex + 1}/${job.imageCount}`);
          
          const command = new CompareFacesCommand({
            SourceImage: { Bytes: referenceImageBuffer },
            TargetImage: { Bytes: image.buffer },
            SimilarityThreshold: 70,
            QualityFilter: 'LOW'  // Accept lower quality matches since we reduced image size
          });
          
          const response = await rekognition.send(command);
          const bestMatch = response.FaceMatches?.[0];
          
          return {
            imageId: imageIndex + 1,
            similarity: bestMatch?.Similarity || 0,
            matched: !!bestMatch,
            url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=${IMAGE_SIZE}` : undefined,
            driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
          };
        } catch (error) {
          console.error(`[API] Error processing image ${image.index as number + 1}:`, error);
          return {
            imageId: (image.index as number) + 1,
            similarity: 0,
            matched: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            url: image.id ? `https://lh3.googleusercontent.com/d/${image.id}=${IMAGE_SIZE}` : undefined,
            driveUrl: `https://drive.google.com/file/d/${image.id}/view`,
          };
        }
      });

      // Wait for all images to process or timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Batch timeout')), SAFE_TIMEOUT * TIMEOUT_WARNING);
      });

      try {
        const processedResults = await Promise.race([
          Promise.all(processingPromises),
          timeoutPromise
        ]) as (ScanResult | null)[];

        // Filter out null results and add to newResults
        newResults.push(...processedResults.filter((r): r is ScanResult => r !== null));
      } catch (error) {
        console.log('[API] Batch processing interrupted due to timeout');
      }

      // Merge results and continue
      const mergedResults = [...results];
      for (const newResult of newResults) {
        const existingIndex = mergedResults.findIndex(r => r.imageId === newResult.imageId);
        if (existingIndex === -1) {
          mergedResults.push(newResult);
        } else {
          mergedResults[existingIndex] = newResult;
        }
      }

      // Save progress
      await storage.updateScanJobResults(jobId, mergedResults, "processing");

      // Calculate next batch
      const lastProcessedIndex = Math.max(...newResults.map(r => r.imageId));
      const isComplete = lastProcessedIndex >= imageCount;

      const nextToken = !isComplete ? JSON.stringify({
        referenceImageId,
        nextIndex: lastProcessedIndex,
        jobId
      }) : null;

      const batchDuration = Date.now() - batchStartTime;
      console.log(`[API] Batch processing completed in ${batchDuration}ms, processed ${newResults.length} images`);

      return res.json({
        ...job,
        results: mergedResults,
        continuationToken: nextToken,
        processing: {
          total: imageCount,
          processed: mergedResults.length,
          isComplete,
          nextIndex: lastProcessedIndex,
          batchDuration,
          imagesPerBatch: newResults.length
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
