import { type ScanJob, type InsertScanJob } from "@shared/schema";

export interface IStorage {
  createScanJob(job: InsertScanJob): Promise<ScanJob>;
  getScanJob(id: number): Promise<ScanJob | undefined>;
  updateScanJobResults(id: number, results: any, status?: string): Promise<ScanJob>;
  updateJobImageCount(id: number, imageCount: number): Promise<ScanJob>;
}

export class MemStorage implements IStorage {
  private jobs: Map<number, ScanJob>;
  private currentId: number;

  constructor() {
    this.jobs = new Map();
    this.currentId = 1;
  }

  async createScanJob(insertJob: InsertScanJob): Promise<ScanJob> {
    const id = this.currentId++;
    const job: ScanJob = { ...insertJob, id, results: null };
    this.jobs.set(id, job);
    return job;
  }

  async getScanJob(id: number): Promise<ScanJob | undefined> {
    return this.jobs.get(id);
  }

  async updateScanJobResults(id: number, results: any, status: string = 'complete'): Promise<ScanJob> {
    const job = this.jobs.get(id);
    if (!job) throw new Error("Job not found");
    
    const updatedJob = { ...job, results, status };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async updateJobImageCount(id: number, imageCount: number): Promise<ScanJob> {
    const job = await this.getScanJob(id);
    
    if (!job) {
      throw new Error(`Job with id ${id} not found`);
    }
    
    // Update the image count
    job.imageCount = imageCount;
    
    // Update the job in memory
    this.jobs.set(id, job);
    
    return job;
  }
}

export const storage = new MemStorage();
