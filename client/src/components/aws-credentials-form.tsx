import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import { DOCUMENTATION_LINKS } from "@shared/config";

const awsCredentialsSchema = z.object({
  awsAccessKeyId: z.string().min(1, "AWS Access Key ID is required"),
  awsSecretAccessKey: z.string().min(1, "AWS Secret Access Key is required"),
});

type AwsCredentials = z.infer<typeof awsCredentialsSchema>;

interface AwsCredentialsFormProps {
  onSubmit: (credentials: AwsCredentials) => void;
}

export function AwsCredentialsForm({ onSubmit }: AwsCredentialsFormProps) {
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const { language } = useLanguage();

  const form = useForm<AwsCredentials>({
    resolver: zodResolver(awsCredentialsSchema),
    defaultValues: {
      awsAccessKeyId: "",
      awsSecretAccessKey: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium flex items-center gap-2">
              {getTranslation("awsAccessKey.label", language)}
              <a
                href={DOCUMENTATION_LINKS.awsCredentials}
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
              type={showAccessKey ? "text" : "password"}
              placeholder={getTranslation("awsAccessKey.placeholder", language)}
              {...form.register("awsAccessKeyId")}
            />
            <Button
              type="button"
              variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowAccessKey(!showAccessKey)}
            >
              {showAccessKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {form.formState.errors.awsAccessKeyId && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {getTranslation("awsAccessKey.required", language)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium flex items-center gap-2">
              {getTranslation("awsSecretKey.label", language)}
              <a
                href={DOCUMENTATION_LINKS.awsCredentials}
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
              type={showSecretKey ? "text" : "password"}
              placeholder={getTranslation("awsSecretKey.placeholder", language)}
              {...form.register("awsSecretAccessKey")}
            />
            <Button
              type="button"
              variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowSecretKey(!showSecretKey)}
            >
              {showSecretKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {form.formState.errors.awsSecretAccessKey && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {getTranslation("awsSecretKey.required", language)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Button type="submit" className="w-full mt-4">
          {getTranslation("submit", language)}
        </Button>
      </form>
    </Form>
  );
}
