import { useCallback, useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import { type ScanJob } from "@shared/schema";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import { AwsCredentialsForm } from "./aws-credentials-form";

interface FaceUploadProps {
  jobId: number;
  imageCount: number;
  onAnalysisComplete: () => void;
  setScanJob: (job: ScanJob | null) => void;
  googleApiKey: string; // Make it required and expect it to be sent
}

export default function FaceUpload({
  jobId,
  imageCount,
  onAnalysisComplete,
  setScanJob,
  googleApiKey, // No longer optional
}: FaceUploadProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const { language } = useLanguage();
  const [awsCredentials, setAwsCredentials] = useState<{
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
  } | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const lastPollTimeRef = useRef<number>(0);
  const minPollIntervalMs = 5000; // Minimum 5 seconds between polls

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png"] },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!file && !continuationToken) throw new Error("No image has been selected.");

      // Ensure we're not hammering the server with continuation requests
      if (continuationToken) {
        const timeSinceLastRequest = Date.now() - lastPollTimeRef.current;
        if (timeSinceLastRequest < minPollIntervalMs) {
          await new Promise(resolve => 
            setTimeout(resolve, minPollIntervalMs - timeSinceLastRequest)
          );
        }
        setIsContinuing(true);
      }
      
      lastPollTimeRef.current = Date.now();
      const formData = new FormData();
      
      // Only append the face image if it's the first request or we need to reestablish the reference
      if (file) {
        formData.append("face", file);
      }

      // Always require AWS credentials
      if (awsCredentials) {
        // Make sure we're appending strings, not objects
        formData.append("awsAccessKeyId", String(awsCredentials.awsAccessKeyId).trim());
        formData.append(
          "awsSecretAccessKey",
          String(awsCredentials.awsSecretAccessKey).trim()
        );
      } else {
        throw new Error("AWS credentials are not defined.");
      }

      // Ensure and log the Google API Key
      if (!googleApiKey) {
        throw new Error("Google API Key is missing");
      }
      
      formData.append("googleApiKey", googleApiKey); // Include Google API Key
      
      // Include continuation token if we have one
      if (continuationToken) {
        formData.append("continuationToken", continuationToken);
        console.log("Using continuation token for batch processing");
      }

      // Use a timeout to prevent hanging forever on Lambda timeouts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout
      
      try {
        const res = await fetch(`/api/analyze/${jobId}`, {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorDetails = await res.json();
          throw new Error("Analysis failed: " + (errorDetails.error || "Unknown error"));
        }
        
        const data = await res.json();
        setIsContinuing(false);
        
        // Store the continuation token if provided
        if (data.continuationToken) {
          setContinuationToken(data.continuationToken);
        } else {
          setContinuationToken(null);
        }
        
        // Check if we need to start polling or continue processing
        if (data.processing && !data.processing.isComplete) {
          setProgress({
            processed: data.processing.processed,
            total: data.processing.total
          });
          
          // If we have a continuation token, continue processing after a sufficient delay
          if (data.continuationToken) {
            // Wait longer between batches to prevent overwhelming the server
            // Use a slightly randomized delay to prevent thundering herd
            const delayMs = 5000 + Math.floor(Math.random() * 1000);
            setTimeout(() => {
              analyzeMutation.mutate();
            }, delayMs); 
          } else {
            // Otherwise fall back to polling
            setIsPolling(true);
          }
          return data;
        }
        
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        
        // If it's an AbortError, this is a timeout - try again with continuation
        if ((error as Error).name === 'AbortError') {
          console.log("Request timed out, will continue with token");
          
          // If we have a continuation token, we can try again
          if (continuationToken) {
            // Wait a bit longer before retry
            setTimeout(() => {
              analyzeMutation.mutate();
            }, 8000); // Wait 8 seconds before retry after timeout
          } else {
            // Start polling as fallback
            setIsPolling(true);
          }
          
          // Return a fake response to prevent error handling
          return {
            processing: {
              isComplete: false,
              processed: progress?.processed || 0,
              total: progress?.total || imageCount
            }
          };
        }
        
        // For other errors, rethrow to trigger onError
        throw error;
      }
    },
    onSuccess: (data) => {
      setScanJob(data);
      
      // If we need to process more batches with continuation token, don't mark as complete yet
      if (continuationToken && data.processing && !data.processing.isComplete) {
        return; // The mutation will auto-trigger another round via setTimeout above
      }
      
      // Only mark as complete if processing is actually done
      if (!data.processing || data.processing.isComplete) {
        onAnalysisComplete();
        setContinuationToken(null); // Clear token when done
      } else if (!continuationToken) {
        // If we don't have a continuation token but process isn't complete,
        // start polling as fallback
        setIsPolling(true);
      }
    },
    onError: (error) => {
      setIsContinuing(false);
      try {
        // Don't toast on abort errors (handled in mutation function)
        if ((error as Error).name !== 'AbortError') {
          toast({
            variant: "destructive",
            title: getTranslation("error.generic", language),
            description: (error as Error).message || "An unknown error occurred",
          });
        }
        
        // If we encounter an error with a continuation token, we can
        // try again after a longer delay
        if (continuationToken) {
          setTimeout(() => {
            // Retry with the same token
            analyzeMutation.mutate();
          }, 10000); // Wait 10 seconds before retry
        }
      } catch (toastError) {
        // Silently handle any toast errors
      }
    },
  });

  // Poll for results when processing large image sets
  useEffect(() => {
    if (isPolling && !analyzeMutation.isPending && !isContinuing) {
      const pollForResults = async () => {
        try {
          // Ensure we're not polling too frequently
          const timeSinceLastPoll = Date.now() - lastPollTimeRef.current;
          if (timeSinceLastPoll < minPollIntervalMs) {
            pollTimerRef.current = window.setTimeout(
              pollForResults, 
              minPollIntervalMs - timeSinceLastPoll
            );
            return;
          }
          
          lastPollTimeRef.current = Date.now();
          
          // Use a timeout to prevent hanging on network issues
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
          
          try {
            // Simple GET request to check job status
            const res = await fetch(`/api/jobs/${jobId}`, { 
              method: "GET",
              credentials: "include",
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (res.ok) {
              const data = await res.json();
              setScanJob(data);
              
              // If the response contains a continuation token, switch to direct processing
              if (data.continuationToken) {
                setContinuationToken(data.continuationToken);
                setIsPolling(false);
                // Trigger the next batch after a delay
                setTimeout(() => {
                  analyzeMutation.mutate();
                }, 5000); // 5 second delay before next batch
                return;
              }
              
              // Check if processing is complete
              if (data.status === 'complete' || 
                  (data.processing && data.processing.isComplete)) {
                setIsPolling(false);
                onAnalysisComplete();
              } else if (data.processing) {
                // Update progress
                setProgress({
                  processed: data.processing.processed,
                  total: data.processing.total
                });
                
                // Throttle polling based on image count but ensure minimum interval
                // Use a slightly randomized interval to prevent synchronized requests
                const baseInterval = data.processing.total > 100 ? 8000 : 10000;
                const randomizedInterval = baseInterval + Math.floor(Math.random() * 2000);
                pollTimerRef.current = window.setTimeout(pollForResults, randomizedInterval);
              } else {
                // If we have results but no processing info, poll less frequently
                pollTimerRef.current = window.setTimeout(pollForResults, 15000);
              }
            } else {
              // On error, wait longer and retry
              console.warn("Error polling for results, will retry in 15 seconds");
              pollTimerRef.current = window.setTimeout(pollForResults, 15000);
            }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            
            // If it's an abort error, handle the timeout
            if ((fetchError as Error).name === 'AbortError') {
              console.warn("Polling request timed out, will retry in 15 seconds");
            } else {
              console.error("Error polling for results:", fetchError);
            }
            
            // On any errors, retry after a longer delay
            pollTimerRef.current = window.setTimeout(pollForResults, 15000);
          }
        } catch (error) {
          // On any unexpected errors, retry after an even longer delay
          console.error("Unexpected error during polling:", error);
          pollTimerRef.current = window.setTimeout(pollForResults, 20000);
        }
      };
      
      // Start polling with a small initial delay
      pollTimerRef.current = window.setTimeout(pollForResults, 2000);
      
      // Cleanup function
      return () => {
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
        }
      };
    }
  }, [isPolling, jobId, setScanJob, onAnalysisComplete, analyzeMutation.isPending, analyzeMutation.mutate, isContinuing]);

  const handleAnalyze = () => {
    // Always require AWS credentials
    if (!awsCredentials) {
      try {
        toast({
          variant: "destructive",
          title: getTranslation("error.credentials", language),
          description: getTranslation("error.credentials", language),
        });
      } catch (error) {
        // Silently catch any toast-related errors
      }
      return;
    }

    if (!file && !continuationToken) {
      try {
        toast({
          variant: "destructive",
          title: "No image selected",
          description: "Please upload a face image before analyzing.",
        });
      } catch (error) {
        // Silently catch any toast-related errors
      }
      return;
    }

    // Reset progress and start analysis
    setProgress(null);
    setIsPolling(false);
    lastPollTimeRef.current = 0; // Reset time tracking
    analyzeMutation.mutate();
  };

  const handleAwsSubmit = (credentials: {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
  }) => {
    setAwsCredentials(credentials);
    // Automatically trigger analysis after credentials are submitted
    setTimeout(() => {
      if (file) {
        analyzeMutation.mutate();
      }
    }, 100);
  };
  
  // Calculate progress percentage
  const progressPercentage = progress 
    ? Math.round((progress.processed / progress.total) * 100)
    : null;

  // Add a function to manually retry the analysis if it fails
  const handleRetryAnalysis = () => {
    // Reset progress and start analysis
    setProgress(null);
    setIsPolling(false);
    lastPollTimeRef.current = 0; // Reset time tracking
    analyzeMutation.mutate();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <p className="text-lg font-semibold mb-2">
          {getTranslation("foundImages", language).replace(
            "{count}",
            String(imageCount),
          )}
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {getTranslation("uploadInstructions", language)}
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-muted"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        {file ? (
          <p className="text-sm">{file.name}</p>
        ) : (
          <p className="text-muted-foreground">
            {getTranslation("dropzoneText", language)}
          </p>
        )}
      </div>

      {/* Always show AWS credentials form when file is uploaded and credentials aren't provided yet */}
      {file && !awsCredentials && (
        <AwsCredentialsForm onSubmit={handleAwsSubmit} />
      )}

      {/* Only show the button when credentials are provided and analysis hasn't started */}
      {file && awsCredentials && !analyzeMutation.isPending && !isPolling && !isContinuing && (
        <Button
          className="w-full"
          onClick={handleAnalyze}
        >
          Analyze Faces
        </Button>
      )}

      {/* Show a loading indicator when analysis is in progress */}
      {(analyzeMutation.isPending || isPolling || isContinuing) && (
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">
            {progress 
              ? `Analyzing... ${progress.processed}/${progress.total} images (${progressPercentage}%)`
              : "Analyzing..."}
          </p>
          <Progress 
            value={progressPercentage || Math.random() * 100} 
            className="w-full" 
          />
          
          {(isPolling || isContinuing) && (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-muted-foreground">
                {isContinuing 
                  ? "Processing batch... This may take a minute per batch." 
                  : "Processing large image set. This will take several minutes."}
              </p>
              
              {/* Add a button to manually continue processing if needed */}
              {!isContinuing && progress && progress.processed > 0 && progress.processed < progress.total && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetryAnalysis}
                  disabled={analyzeMutation.isPending}
                >
                  Continue Processing
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
