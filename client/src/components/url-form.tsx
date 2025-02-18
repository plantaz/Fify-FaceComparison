import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { driveUrlSchema, type DriveUrlInput } from "@shared/schema";
import { isDevelopment, DOCUMENTATION_LINKS } from "@shared/config";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import * as z from 'zod';

interface UrlFormProps {
  onScanComplete: (job: any) => void;
  onCredentialsSubmit?: (googleApiKey: string) => void;
}

interface FormData extends DriveUrlInput {
  googleApiKey?: string;
}

export default function UrlForm({ onScanComplete, onCredentialsSubmit }: UrlFormProps) {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(
      driveUrlSchema.extend({
        googleApiKey: isDevelopment 
          ? z.string().optional()
          : z.string().min(1, "Google API Key is required")
      })
    ),
    defaultValues: { 
      url: "",
      googleApiKey: "" 
    }
  });

  const scanMutation = useMutation({
    mutationFn: async (data: FormData) => {
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
      if (!isDevelopment && onCredentialsSubmit) {
        onCredentialsSubmit(form.getValues("googleApiKey") || "");
      }
      onScanComplete(data);
    },
    onError: (error: Error) => {
      const isCredentialsError = error.message.includes('credentials not configured');
      toast({
        variant: "destructive",
        title: isCredentialsError ? "Missing API Credentials" : "Error",
        description: isCredentialsError 
          ? "Cloud storage access is not properly configured. Please check your credentials."
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

            {!isDevelopment && (
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    Google API Key
                    <a 
                      href={DOCUMENTATION_LINKS.googleApiKey}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </label>
                </div>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder="Enter your Google API Key"
                    {...form.register("googleApiKey")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {form.formState.errors.url && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {form.formState.errors.url.message}
                </AlertDescription>
              </Alert>
            )}

            {form.formState.errors.googleApiKey && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {form.formState.errors.googleApiKey.message}
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