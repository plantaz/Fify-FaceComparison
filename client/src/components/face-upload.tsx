import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import { type ScanJob } from "@shared/schema";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import { isProduction } from "@shared/config";
import { AwsCredentialsForm } from "./aws-credentials-form";

interface FaceUploadProps {
  jobId: number;
  imageCount: number;
  onAnalysisComplete: () => void;
  setScanJob: (job: ScanJob | null) => void;
}

export default function FaceUpload({ jobId, imageCount, onAnalysisComplete, setScanJob }: FaceUploadProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const { language } = useLanguage();
  const [awsCredentials, setAwsCredentials] = useState<{ awsAccessKeyId: string; awsSecretAccessKey: string } | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const formData = new FormData();
      formData.append('face', file);

      if (isProduction && awsCredentials) {
        formData.append('awsAccessKeyId', awsCredentials.awsAccessKeyId);
        formData.append('awsSecretAccessKey', awsCredentials.awsSecretAccessKey);
      }

      const res = await fetch(`/api/analyze/${jobId}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      setScanJob(data);
      onAnalysisComplete();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: getTranslation("error.generic", language),
        description: error.message
      });
    }
  });

  const handleAnalyze = () => {
    if (isProduction && !awsCredentials) {
      toast({
        variant: "destructive",
        title: getTranslation("error.credentials", language),
        description: getTranslation("error.credentials", language)
      });
      return;
    }
    analyzeMutation.mutate();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <p className="text-lg font-semibold mb-2">
          {getTranslation("foundImages", language).replace("{count}", String(imageCount))}
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {getTranslation("uploadInstructions", language)}
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted'}
        `}
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

      {isProduction && file && !awsCredentials && (
        <AwsCredentialsForm onSubmit={setAwsCredentials} />
      )}

      {file && (!isProduction || awsCredentials) && (
        <Button
          className="w-full"
          onClick={handleAnalyze}
          disabled={analyzeMutation.isPending}
        >
          {analyzeMutation.isPending 
            ? getTranslation("analyze.loading", language)
            : getTranslation("analyze.button", language)
          }
        </Button>
      )}

      {analyzeMutation.isPending && (
        <Progress value={Math.random() * 100} className="w-full" />
      )}
    </div>
  );
}