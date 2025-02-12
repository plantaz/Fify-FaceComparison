import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface FaceUploadProps {
  jobId: number;
  imageCount: number;
  onAnalysisComplete: () => void;
}

export default function FaceUpload({ jobId, imageCount, onAnalysisComplete }: FaceUploadProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

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
        title: "Error",
        description: error.message
      });
    }
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">
          Found {imageCount} Images
        </h2>
        <p className="text-muted-foreground">
          Upload a face photo to search through them
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
            Drag & drop a face photo or click to select
          </p>
        )}
      </div>

      {file && (
        <Button
          className="w-full"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
        >
          {analyzeMutation.isPending ? "Analyzing..." : "Start Analysis"}
        </Button>
      )}

      {analyzeMutation.isPending && (
        <Progress value={Math.random() * 100} className="w-full" />
      )}
    </div>
  );
}
