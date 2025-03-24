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
import { cn } from "@/lib/utils";

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
  const [hasEnvAwsCredentials, setHasEnvAwsCredentials] = useState(false);

  // Check if AWS credentials are set in env vars
  useEffect(() => {
    // If the job was provided from the URL form, check if it has hasEnvAwsCredentials flag
    if (setScanJob && typeof setScanJob === 'function') {
      const checkJobForEnvVars = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (res.ok) {
            const job = await res.json();
            if (job.hasEnvAwsCredentials) {
              setHasEnvAwsCredentials(true);
              // Auto-start analysis with env credentials
              setAwsCredentials({
                awsAccessKeyId: "ENV_VAR_SET",
                awsSecretAccessKey: "ENV_VAR_SET"
              });
            }
          }
        } catch (error) {
          console.error("Error checking job status:", error);
        }
      };
      
      checkJobForEnvVars();
    }
  }, [jobId, setScanJob]);

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

      // Always append AWS credentials if they're not set in env vars
      if (awsCredentials && !hasEnvAwsCredentials) {
        // Make sure we're appending strings, not objects
        formData.append("awsAccessKeyId", String(awsCredentials.awsAccessKeyId).trim());
        formData.append(
          "awsSecretAccessKey",
          String(awsCredentials.awsSecretAccessKey).trim()
        );
      } else if (!hasEnvAwsCredentials) {
        throw new Error("AWS credentials are not defined.");
      }

      // Ensure and append Google API Key if not set in env vars
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
            imageCount.toString()
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {getTranslation("uploadInstructions", language)}
        </p>
      </div>

      {/* Face image section - conditionally allow changes */}
      {isPolling || isContinuing || analyzeMutation.isPending ? (
        // Locked view when analysis is running
        <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded bg-gray-200 dark:bg-gray-700 p-2 flex items-center justify-center">
              <Upload className="h-8 w-8 text-gray-500" />
            </div>
            <div className="flex-1">
              <p className="font-medium">
                {file ? file.name : "Face Image"}
              </p>
              {file && (
                <p className="text-sm text-muted-foreground">
                  {Math.round(file.size / 1024)} KB
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Analysis in progress - cannot change face image
              </p>
            </div>
          </div>
        </div>
      ) : (
        // Interactive dropzone when not analyzing
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/10"
              : "border-gray-300 hover:border-primary"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 text-gray-400 mb-2" />
          <p className="text-center text-muted-foreground">
            {getTranslation("dropzoneText", language)}
          </p>
          {file && (
            <div className="mt-2 text-sm font-medium text-center">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </div>
          )}
        </div>
      )}

      {!awsCredentials ? (
        /* AWS Credentials form */
        <div className="space-y-6">
          {hasEnvAwsCredentials ? (
            <Button 
              onClick={handleAnalyze} 
              className="w-full"
              disabled={!file}
            >
              {analyzeMutation.isPending
                ? getTranslation("analyze.loading", language)
                : getTranslation("analyze.button", language)}
            </Button>
          ) : (
            <AwsCredentialsForm onSubmit={handleAwsSubmit} />
          )}
        </div>
      ) : (
        /* Analysis controls and progress */
        <div className="space-y-6">
          {progressPercentage !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {progress?.processed || 0} / {progress?.total || 0} images
                </span>
                <span className="text-sm font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} />
            </div>
          )}

          {!analyzeMutation.isPending && !isPolling && !isContinuing && (
            <Button
              onClick={handleAnalyze}
              className="w-full"
              disabled={analyzeMutation.isPending || isPolling || isContinuing || !file}
            >
              {getTranslation("analyze.button", language)}
            </Button>
          )}

          {/* Display a retry button if analysis fails */}
          {analyzeMutation.isError && !isPolling && !isContinuing && (
            <Button
              onClick={handleRetryAnalysis}
              className="w-full"
              variant="destructive"
            >
              Retry Analysis
            </Button>
          )}

          {/* Show as loading if we're analyzing, polling or continuing */}
          {(analyzeMutation.isPending || isPolling || isContinuing) && (
            <Button disabled className="w-full">
              <span className="mr-2">
                {getTranslation("analyze.loading", language)}
              </span>
              {/* Simplified loading spinner */}
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
