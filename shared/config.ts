import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development"]).default("development")
});

export const credentialsSchema = z.object({
  googleApiKey: z.string().min(1, "Google API Key is required"),
  awsAccessKeyId: z.string().min(1, "AWS Access Key ID is required"),
  awsSecretAccessKey: z.string().min(1, "AWS Secret Access Key is required")
});

export type Credentials = z.infer<typeof credentialsSchema>;

// Always in development mode
export const isDevelopment = true;

// Links for documentation
export const DOCUMENTATION_LINKS = {
  googleApiKey: "https://cloud.google.com/docs/authentication/api-keys",
  awsCredentials: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html"
} as const;
