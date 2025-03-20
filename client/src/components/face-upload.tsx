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
      if (!file) throw new Error("No image has been selected.");

      const formData = new FormData();
      formData.append("face", file);

      // Always require AWS credentials
      if (awsCredentials) {
        // Make sure we're appending strings, not objects
        formData.append("awsAccessKeyId", String(awsCredentials.awsAccessKeyId).trim());
        formData.append(
          "awsSecretAccessKey",
          String(awsCredentials.awsSecretAccessKey).trim()
        );
        
        // Debug log to confirm credentials are being added to form data
        console.log("Added AWS credentials to form data:", {
          accessKeyLength: awsCredentials.awsAccessKeyId.trim().length,
          secretKeyLength: awsCredentials.awsSecretAccessKey.trim().length
        });
      } else {
        throw new Error("AWS credentials are not defined.");
      }

      // Ensure and log the Google API Key
      if (!googleApiKey) {
        throw new Error("Google API Key is missing");
      }
      
      // Avoid excessive console logging that could cause issues
      // console.log("Google API Key length:", googleApiKey.length);
      
      formData.append("googleApiKey", googleApiKey); // Include Google API Key

      const res = await fetch(`/api/analyze/${jobId}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorDetails = await res.json();
        // Avoid console error logs that might trigger hide-notification warnings
        // console.error("Analysis error details:", errorDetails);
        throw new Error("Analysis failed: " + (errorDetails.error || "Unknown error"));
      }
      
      const data = await res.json();
      
      // Check if we need to start polling (partial results)
      if (data.processing && !data.processing.isComplete) {
        setProgress({
          processed: data.processing.processed,
          total: data.processing.total
        });
        setIsPolling(true);
        return data;
      }
      
      return data;
    },
    onSuccess: (data) => {
      setScanJob(data);
      
      // Only mark as complete if processing is actually done
      if (!data.processing || data.processing.isComplete) {
        onAnalysisComplete();
      } else {
        // Start polling for updates if not complete
        setIsPolling(true);
      }
    },
    onError: (error) => {
      // Remove error logging to console to prevent "hide-notification" warnings
      try {
        toast({
          variant: "destructive",
          title: getTranslation("error.generic", language),
          description: error.message || "An unknown error occurred",
        });
      } catch (toastError) {
        // Silently handle any toast errors
      }
    },
  });

  // Poll for results when processing large image sets
  useEffect(() => {
    if (isPolling && !analyzeMutation.isPending) {
      const pollForResults = async () => {
        try {
          // Simple GET request to check job status
          const res = await fetch(`/api/jobs/${jobId}`, { 
            method: "GET",
            credentials: "include" 
          });
          
          if (res.ok) {
            const data = await res.json();
            setScanJob(data);
            
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
              
              // If we have more than 100 images to process, use more aggressive polling
              // to ensure we capture each batch completion quickly
              const pollInterval = data.processing.total > 100 ? 1000 : 3000;
              pollTimerRef.current = window.setTimeout(pollForResults, pollInterval);
            } else {
              // If we have results but no processing info, assume we need to continue polling
              pollTimerRef.current = window.setTimeout(pollForResults, 2000);
            }
          } else {
            // On error, wait longer and retry
            console.warn("Error polling for results, will retry in 5 seconds");
            pollTimerRef.current = window.setTimeout(pollForResults, 5000);
          }
        } catch (error) {
          console.error("Error polling for results:", error);
          // On network errors, retry after a delay
          pollTimerRef.current = window.setTimeout(pollForResults, 5000);
        }
      };
      
      // Start polling immediately
      pollForResults();
      
      // Cleanup function
      return () => {
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
        }
      };
    }
  }, [isPolling, jobId, setScanJob, onAnalysisComplete, analyzeMutation.isPending]);

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

    if (!file) {
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
      {file && awsCredentials && !analyzeMutation.isPending && !isPolling && (
        <Button
          className="w-full"
          onClick={handleAnalyze}
        >
          Analyze Faces
        </Button>
      )}

      {/* Show a loading indicator when analysis is in progress */}
      {(analyzeMutation.isPending || isPolling) && (
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
          
          {isPolling && (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-muted-foreground">
                Processing large image set. This may take several minutes.
              </p>
              
              {/* Add a button to manually continue processing if needed */}
              {progress && progress.processed > 0 && progress.processed < progress.total && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetryAnalysis}
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
