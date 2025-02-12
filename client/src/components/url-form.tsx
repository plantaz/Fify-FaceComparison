import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { driveUrlSchema, type DriveUrlInput, type ScanJob } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { validateDriveUrl } from "@/lib/drive-utils";

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
      onScanComplete(data);
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
    <div className="max-w-xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => scanMutation.mutate(data))}>
          <div className="space-y-4">
            <Input
              placeholder="Paste your OneDrive or Google Drive URL"
              {...form.register("url")}
            />
            
            {form.formState.errors.url && (
              <p className="text-sm text-destructive">
                {form.formState.errors.url.message}
              </p>
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
