export interface CloudImage {
  id?: string;
  name?: string;
  buffer: Buffer;
  index?: number; // Index in the original file list
}

export interface CloudStorageProvider {
  scanDirectory: (url: string) => Promise<number>;
  getImages: (startIndex: number, count: number, imageSize?: string) => Promise<CloudImage[]>;
  getSingleImage: (imageId: string, imageSize?: string) => Promise<CloudImage | null>;
  getImageBatch: (startIndex: number, count: number, imageSize?: string) => Promise<CloudImage[]>;
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

export class GoogleStorageProvider implements CloudStorageProvider {
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

  async getImages(startIndex: number, count: number, imageSize: string = 's1000'): Promise<CloudImage[]> {
    try {
      console.log(`Downloading batch of ${count} images (${imageSize} size)`);
      const files = await this.getFiles();
      const batch = files.slice(startIndex, startIndex + count);
      
      // Download images in parallel
      const downloadPromises = batch.map(async (file, index) => {
        try {
          const imageUrl = `https://lh3.googleusercontent.com/d/${file.id}=${imageSize}`;
          const response = await fetch(imageUrl);
          
          if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
          }
          
          const buffer = Buffer.from(await response.arrayBuffer());
          return {
            ...file,
            buffer,
            index: startIndex + index
          };
        } catch (error) {
          console.error(`Error downloading image ${file.id}:`, error);
          return {
            ...file,
            index: startIndex + index
          };
        }
      });
      
      return Promise.all(downloadPromises) as Promise<CloudImage[]>;
    } catch (error) {
      console.error('Error getting image batch:', error);
      return [];
    }
  }

  async getSingleImage(imageId: string, imageSize: string = 's1000'): Promise<CloudImage | null> {
    try {
      const imageUrl = `https://lh3.googleusercontent.com/d/${imageId}=${imageSize}`;
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        id: imageId,
        name: `Image ${imageId}`,
        buffer
      };
    } catch (error) {
      console.error(`Error downloading single image ${imageId}:`, error);
      return null;
    }
  }

  async getImageBatch(startIndex: number, count: number, imageSize: string = 's1000'): Promise<CloudImage[]> {
    try {
      console.log(`Downloading batch of ${count} images (${imageSize} size)`);
      const files = await this.getFiles();
      const batch = files.slice(startIndex, startIndex + count);
      
      // Download images in parallel
      const downloadPromises = batch.map(async (file, index) => {
        try {
          const imageUrl = `https://lh3.googleusercontent.com/d/${file.id}=${imageSize}`;
          const response = await fetch(imageUrl);
          
          if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
          }
          
          const buffer = Buffer.from(await response.arrayBuffer());
          return {
            ...file,
            buffer,
            index: startIndex + index
          };
        } catch (error) {
          console.error(`Error downloading image ${file.id}:`, error);
          return {
            ...file,
            index: startIndex + index
          };
        }
      });
      
      return Promise.all(downloadPromises) as Promise<CloudImage[]>;
    } catch (error) {
      console.error('Error getting image batch:', error);
      return [];
    }
  }

  private async getFiles(): Promise<{ id: string; name: string }[]> {
    if (!this.listFiles || this.listFiles.length === 0) {
      await this.scanDirectory(this.url);
    }
    return this.listFiles;
  }
}