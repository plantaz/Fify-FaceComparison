import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scanJobs = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  driveUrl: text("drive_url").notNull(),
  driveType: text("drive_type").notNull(), // 'onedrive' | 'gdrive'
  imageCount: integer("image_count").notNull(),
  status: text("status").notNull(), // 'pending' | 'scanning' | 'complete' | 'error'
  results: jsonb("results"),
  createdAt: text("created_at").notNull()
});

export const insertScanJobSchema = createInsertSchema(scanJobs).pick({
  driveUrl: true,
  driveType: true,
  imageCount: true,
  status: true,
  createdAt: true
});

export const driveUrlSchema = z.object({
  url: z.string().url()
    .refine(url => url.includes('onedrive') || url.includes('drive.google'), {
      message: "URL must be from OneDrive or Google Drive"
    })
});

export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
export type ScanJob = typeof scanJobs.$inferSelect;
export type DriveUrlInput = z.infer<typeof driveUrlSchema>;
