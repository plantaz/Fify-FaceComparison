import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { driveUrlSchema, type DriveUrlInput } from "@shared/schema";
import { DOCUMENTATION_LINKS } from "@shared/config";
import { useMutation } from "@tanstack/react-query";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import * as z from "zod";

interface UrlFormProps {
  onScanComplete: (job: any, googleApiKey: string) => void;
}

interface FormData extends DriveUrlInput {
  googleApiKey: string;
}

export default function UrlForm({ onScanComplete }: UrlFormProps) {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const { language } = useLanguage();
  const [hasEnvGoogleApiKey, setHasEnvGoogleApiKey] = useState(false);

  // Check for environment variables on mount
  useEffect(() => {
    fetch('/api/env-check')
      .then(res => res.json())
      .then(data => {
        if (data.googleApiKey) {
          console.log("Google API Key found in environment variables, hiding input field");
          setHasEnvGoogleApiKey(true);
        }
      })
      .catch(err => {
        console.error("Error checking environment variables:", err);
      });
  }, []);

  const form = useForm<FormData>({
    resolver: zodResolver(
      driveUrlSchema.extend({
        googleApiKey: hasEnvGoogleApiKey 
          ? z.string().optional() 
          : z.string().min(1, getTranslation("googleApiKey.required", language))
      })
    ),
    defaultValues: {
      url: "",
      googleApiKey: "",
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("Submitting scan with URL:", data.url);
      
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: data.url,
          googleApiKey: data.googleApiKey // Include it if provided by user
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Scan API error:", errorText);
        throw new Error(errorText);
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.imageCount === 0) {
        toast({
          variant: "default",
          title: getTranslation("noImages.title", language),
          description: getTranslation("noImages.description", language),
        });
        return;
      }
      
      // Check if environment variables are set in the backend
      if (data.hasEnvGoogleApiKey) {
        setHasEnvGoogleApiKey(true);
      }
      
      // Pass the API key (either from form or env var)
      onScanComplete(data, variables.googleApiKey || "ENV_VAR_SET");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: getTranslation("error.generic", language),
        description: error.message,
      });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => scanMutation.mutate(data))} className="space-y-4 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="drive-url" className="text-sm font-medium flex items-center gap-2">
            {getTranslation("url.label", language)}
          </label>
        </div>
        <Input
          id="drive-url"
          placeholder={getTranslation("url.placeholder", language)}
          {...form.register("url")}
          className="w-full"
        />
        {form.formState.errors.url && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {form.formState.errors.url.message}
            </AlertDescription>
          </Alert>
        )}

        {!hasEnvGoogleApiKey && (
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-2">
                {getTranslation("googleApiKey.label", language)}
                <a
                  href={DOCUMENTATION_LINKS.googleApiKey}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600"
                  aria-label="Google API key documentation"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </label>
            </div>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder={getTranslation("googleApiKey.placeholder", language)}
                {...form.register("googleApiKey")}
                className="w-full"
              />
              <Button
                type="button"
                variant="ghost"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
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

        <Button
          type="submit"
          className="w-full"
          disabled={scanMutation.isPending}
        >
          {scanMutation.isPending
            ? getTranslation("scan.loading", language)
            : getTranslation("scan.button", language)}
        </Button>
      </form>
    </Form>
  );
}