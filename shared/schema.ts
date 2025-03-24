import { z } from "zod";

// Define the ScanJob type
export type ScanJob = {
  id: number;
  driveUrl: string;
  driveType: string; // 'gdrive'
  imageCount: number;
  status: string; // 'pending' | 'scanning' | 'complete' | 'error'
  results: any[] | null;
  createdAt: string;
};

// URL validation schema
export const driveUrlSchema = z.object({
  url: z.string().url()
    .refine(url => url.includes('drive.google'), {
      message: "URL must be from Google Drive"
    })
});

// Schema for creating new jobs
export const insertScanJobSchema = z.object({
  driveUrl: z.string(),
  driveType: z.string(),
  imageCount: z.number(),
  status: z.string(),
  createdAt: z.string()
});

export type DriveUrlInput = z.infer<typeof driveUrlSchema>;
export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
