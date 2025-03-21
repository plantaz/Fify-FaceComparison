export interface CloudImage {
  id?: string;
  name?: string;
  buffer: Buffer;
  index?: number; // Index in the original file list
}

export interface CloudStorageProvider {
  scanDirectory: (url: string) => Promise<number>;
  getImages: () => Promise<CloudImage[]>;
  getSingleImage: (index: number) => Promise<CloudImage | null>;
  getImageBatch: (startIndex: number, count: number) => Promise<CloudImage[]>;
}

export function createStorageProvider(
  url: string,
  apiKey: string,
): CloudStorageProvider {
  if (url.includes("drive.google.com")) {
    return new GoogleStorageProvider(url, apiKey);
  }

  throw new Error("Unsupported storage provider");
}

class GoogleStorageProvider implements CloudStorageProvider {
  private url: string;
  private apiKey: string;
  private listFiles: { id: string; name: string }[] = [];

  constructor(url: string, apiKey: string) {
    this.url = url;
    this.apiKey = apiKey;
  }

  async scanDirectory(url: string): Promise<number> {
    try {
      const parsedUrl = new URL(url);
      const folderPathMatch = parsedUrl.pathname.match(/\/folders\/([^/?]+)/);
      if (!folderPathMatch) {
        throw new Error("Invalid Google Drive folder URL");
      }

      const folderId = folderPathMatch[1];
      this.listFiles = []; // Reset the list
      
      // Use pagination to get all files (Google Drive API only returns up to 100 files per request)
      let nextPageToken: string | undefined;
      let totalFetched = 0;
      
      do {
        // Build the URL with pageToken if we have one
        let apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&pageSize=1000&key=${this.apiKey}`;
        if (nextPageToken) {
          apiUrl += `&pageToken=${nextPageToken}`;
        }
        
        console.log(`Fetching Drive files page ${nextPageToken ? "with token" : "1"}`);
        
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.error) {
          throw new Error(
            `Google Drive API error: ${data.error.message || "Unknown error"}`,
          );
        }

        // Filter for only image files and add to our list
        const pageFiles = data.files.filter((file: any) =>
          file.mimeType?.startsWith("image/")
        );
        
        this.listFiles.push(...pageFiles);
        totalFetched += pageFiles.length;
        console.log(`Added ${pageFiles.length} images from page, total: ${totalFetched}`);
        
        // Check if there are more pages
        nextPageToken = data.nextPageToken;
        
        // Add a small delay between pagination requests to avoid rate limiting
        if (nextPageToken) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } while (nextPageToken);

      console.log(`Found ${this.listFiles.length} images in Google Drive folder`);
      return this.listFiles.length;
    } catch (error) {
      console.error("Error listing files:", error);
      throw new Error(
        `Failed to scan Google Drive directory: ${
          (error as Error).message || "Unknown error"
        }`,
      );
    }
  }

  async getImages(): Promise<CloudImage[]> {
    // Get images from the specified folder
    if (!this.listFiles || this.listFiles.length === 0) {
      // Reinitialize if files list is not available
      await this.scanDirectory(this.url);
    }

    // Parallel fetch with concurrency limit
    const MAX_CONCURRENT_DOWNLOADS = 2; // Limit concurrent downloads to avoid overloading APIs
    const results: CloudImage[] = [];
    
    // Process files in small batches
    for (let i = 0; i < this.listFiles.length; i += MAX_CONCURRENT_DOWNLOADS) {
      // Define a batch of files to process
      const batch = this.listFiles.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
      
      console.log(`Processing batch ${Math.floor(i/MAX_CONCURRENT_DOWNLOADS) + 1}/${Math.ceil(this.listFiles.length/MAX_CONCURRENT_DOWNLOADS)}`);
      
      // Process this batch of files with a concurrency limit
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            // Smaller s1000 size for analysis is plenty (faces don't need high resolution)
            // This significantly reduces download size and time
            const imageUrl = `https://lh3.googleusercontent.com/d/${file.id}=s1000`;
            
            console.log(`Downloading image (s1000 size) for file: ${file.name || file.id}`);
            const response = await fetch(imageUrl);
            
            if (!response.ok) {
              console.error(`Failed to fetch image for ${file.name || file.id}: ${response.statusText}`);
              return null;
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            return { 
              id: file.id, 
              name: file.name,
              buffer 
            };
          } catch (error) {
            console.error(`Error downloading file ${file.name || file.id}:`, error);
            return null;
          }
        })
      );
      
      // Filter out any null results and add the successful ones
      batchResults.filter(Boolean).forEach(item => {
        if (item) results.push(item);
      });
      
      // Add a small delay between batches to avoid rate limiting
      if (i + MAX_CONCURRENT_DOWNLOADS < this.listFiles.length) {
        console.log("Adding delay between batches to avoid rate limiting");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Downloaded ${results.length} images for analysis`);
    return results;
  }

  async getSingleImage(index: number): Promise<CloudImage | null> {
    try {
      // Make sure we have files
      if (!this.listFiles || this.listFiles.length === 0) {
        // Reinitialize if files list is not available
        await this.scanDirectory(this.url);
      }
      
      // Check if index is valid
      if (index < 0 || index >= this.listFiles.length) {
        console.log(`Requested image at index ${index} is out of bounds (0-${this.listFiles.length - 1})`);
        return null;
      }
      
      const file = this.listFiles[index];
      console.log(`Downloading single image (s1000 size) for file: ${file.name || file.id}`);
      
      try {
        // Use s1000 size which works better for face recognition while still being optimized
        const imageUrl = `https://lh3.googleusercontent.com/d/${file.id}=s1000`;
        
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.error(`Failed to fetch image for ${file.name || file.id}: ${response.statusText}`);
          return null;
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        return { 
          id: file.id, 
          name: file.name,
          buffer 
        };
      } catch (error) {
        console.error(`Error downloading file ${file.name || file.id}:`, error);
        return null;
      }
    } catch (error) {
      console.error("Error getting single image:", error);
      return null;
    }
  }
  
  // New method: get multiple images in parallel for faster processing
  async getImageBatch(startIndex: number, count: number): Promise<CloudImage[]> {
    try {
      // Make sure we have files
      if (!this.listFiles || this.listFiles.length === 0) {
        // Reinitialize if files list is not available
        await this.scanDirectory(this.url);
      }
      
      // Validate indexes
      const endIndex = Math.min(startIndex + count, this.listFiles.length);
      if (startIndex >= this.listFiles.length || startIndex < 0) {
        console.log(`Start index ${startIndex} is out of bounds`);
        return [];
      }
      
      // Get the batch of files to process
      const filesToProcess = this.listFiles.slice(startIndex, endIndex);
      console.log(`Downloading batch of ${filesToProcess.length} images (s1000 size)`);
      
      // Process all files in parallel for speed
      const results = await Promise.all(
        filesToProcess.map(async (file, index) => {
          try {
            const imageUrl = `https://lh3.googleusercontent.com/d/${file.id}=s1000`;
            const response = await fetch(imageUrl);
            
            if (!response.ok) {
              console.error(`Failed to fetch image for ${file.name || file.id}: ${response.statusText}`);
              return null;
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            return { 
              id: file.id, 
              name: file.name,
              buffer,
              index: startIndex + index // Include the original index for reference
            };
          } catch (error) {
            console.error(`Error downloading file ${file.name || file.id}:`, error);
            return null;
          }
        })
      );
      
      // Filter out any failures
      return results.filter(Boolean) as CloudImage[];
    } catch (error) {
      console.error("Error getting image batch:", error);
      return [];
    }
  }
}