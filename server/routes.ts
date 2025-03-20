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
      
      // Extract form values
      const awsAccessKeyId = req.body.awsAccessKeyId;
      const awsSecretAccessKey = req.body.awsSecretAccessKey;
      const googleApiKey = req.body.googleApiKey;
      const continuationToken = req.body.continuationToken;
      
      // Log less frequently to reduce console noise
      if (!continuationToken) {
        console.log("[API] New analysis started for job:", jobId);
      } else {
        console.log("[API] Continuation request for job:", jobId);
      }

      // Trim and clean up credential strings
      const cleanAwsAccessKeyId = awsAccessKeyId?.trim();
      const cleanAwsSecretAccessKey = awsSecretAccessKey?.trim();
      const cleanGoogleApiKey = googleApiKey?.trim();
      let parsedToken = null;
      
      // Parse the continuation token if present
      try {
        if (continuationToken) {
          parsedToken = JSON.parse(continuationToken);
        }
      } catch (tokenError) {
        console.error("[API] Error parsing continuation token:", tokenError);
      }

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

      // Lambda safe timeout (3 seconds timeout for ultra-safety)
      const startTime = Date.now();
      const SAFE_TIMEOUT = 3000; // Only 3 seconds to be ultra conservative
      
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
          
          // Get reference image ID from storage
          if (!parsedToken.referenceImageId) {
            return res.status(400).json({ error: "Reference image ID missing in continuation token" });
          }
          
          // Reference image will be fetched from Drive or from uploaded image
          if (parsedToken.referenceImageId === "reference") {
            // This is an uploaded image that we'll use directly from the request
            if (!req.file || !req.file.buffer) {
              // We need the reference image in the first request
              if (startIndex === 0) {
                return res.status(400).json({ error: "Reference image buffer not found" });
              }
              
              // If not the first request, let's use a special continuation logic
              // with a dummy buffer that will get replaced below
              referenceImageBuffer = Buffer.from([]);
            } else {
              referenceImageBuffer = req.file.buffer;
            }
          } else {
            // Fetch reference image from Drive or storage
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
        }
      } else {
        // First request with the face image uploaded
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "Reference image buffer not found" });
        }
        referenceImageBuffer = req.file.buffer;
        
        // Store the reference image ID for future requests
        parsedToken = { referenceImageId: "reference", nextIndex: 0 };
      }
      
      // Ensure we have a valid reference image buffer
      if (!referenceImageBuffer || referenceImageBuffer.length === 0) {
        if (startIndex > 0 && req.file && req.file.buffer) {
          // Use the uploaded file if available
          referenceImageBuffer = req.file.buffer;
        } else {
          return res.status(400).json({ error: "Failed to load reference image" });
        }
      }

      // Get or initialize provider - don't scan directory each time, 
      // only do it once initially or when token indicates index 0
      const provider = createStorageProvider(job.driveUrl, cleanGoogleApiKey);
      
      // Only initialize if this is the first batch or we're starting fresh
      if (startIndex === 0) {
        await provider.scanDirectory(job.driveUrl);
      }
      
      // Check remaining time before getting images
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.5) {
        // Already used half our budget, return early with continuation token
        console.log(`[API] Approaching time limit before fetching images`);
        
        // Create continuation token to restart
        const nextToken = JSON.stringify({
          referenceImageId: parsedToken.referenceImageId,
          nextIndex: startIndex
        });
        
        // Return current results with continuation token
        return res.json({
          ...job,
          results,
          continuationToken: nextToken,
          processing: {
            total: job.imageCount, // Use the count we know from job
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
      // Get image list (this uses smaller s200 versions now)
      const images = await provider.getImages();
      
      if (images.length === 0) {
        return res.status(500).json({ error: "No images found in Drive folder" });
      }
      
      console.log(`[API] Total images: ${images.length}, processing index: ${startIndex}`);
      
      // Process ONE image per Lambda invocation
      // This is ultra, ultra conservative to ensure we complete within the Lambda time limit
      const BATCH_SIZE = 1;
      const endIndex = Math.min(startIndex + BATCH_SIZE, images.length);
      let isComplete = false;
      
      // Check if we're approaching timeout before even starting the processing loop
      if (Date.now() - startTime > SAFE_TIMEOUT * 0.7) {
        console.log(`[API] Already approaching time limit before processing, returning continuation token`);
        
        // Create continuation token for next batch
        const nextToken = JSON.stringify({
          referenceImageId: parsedToken.referenceImageId, 
          nextIndex: startIndex
        });
        
        // Return continuation token immediately
        return res.json({
          ...job,
          results,
          continuationToken: nextToken,
          processing: {
            total: images.length,
            processed: results.length,
            isComplete: false,
            nextIndex: startIndex
          }
        });
      }
      
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
            
            // Save progress after EACH image to ensure we don't lose results
            try {
              await storage.updateScanJobResults(jobId, results, "processing");
            } catch (saveError) {
              console.error("Error saving results after image:", saveError);
            }
            
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
            
            // Save progress even after errors
            try {
              await storage.updateScanJobResults(jobId, results, "processing");
            } catch (saveError) {
              console.error("Error saving results after rekognition error:", saveError);
            }
          }
        } catch (error) {
          console.error(`Face comparison error for image ${i + 1}:`, error);
          results.push({
            imageId: i + 1,
            similarity: 0,
            matched: false,
          });
          
          // Save progress even after errors
          try {
            await storage.updateScanJobResults(jobId, results, "processing");
          } catch (saveError) {
            console.error("Error saving results after face comparison error:", saveError);
          }
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
