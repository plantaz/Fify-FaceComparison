import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { driveUrlSchema, type DriveUrlInput, type ScanJob } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UrlFormProps {
  onScanComplete: (job: ScanJob) => void;
}

export default function UrlForm({ onScanComplete }: UrlFormProps) {
  const { toast } = useToast();
  const form = useForm<DriveUrlInput>({
    resolver: zodResolver(driveUrlSchema),
    defaultValues: { url: "" }
  });

  const scanMutation = useMutation({
    mutationFn: async (data: DriveUrlInput) => {
      const res = await apiRequest("POST", "/api/scan", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.imageCount === 0) {
        toast({
          variant: "default",
          title: "No Images Found",
          description: "The provided directory doesn't contain any compatible images."
        });
        return;
      }
      onScanComplete(data);
    },
    onError: (error: Error) => {
      const isCredentialsError = error.message.includes('credentials not configured');
      toast({
        variant: "destructive",
        title: isCredentialsError ? "Missing API Credentials" : "Error",
        description: isCredentialsError 
          ? "Cloud storage access is not properly configured. Please try again later."
          : error.message
      });
    }
  });

  return (
    <div className="max-w-xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => scanMutation.mutate(data))}>
          <div className="space-y-4">
            <Input
              placeholder="Paste your OneDrive or Google Drive URL"
              {...form.register("url")}
            />

            {form.formState.errors.url && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {form.formState.errors.url.message}
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? "Scanning..." : "Start Scanning"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}