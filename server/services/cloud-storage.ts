import { DriveUrlInput } from "@shared/schema";

export interface CloudStorageProvider {
  scanDirectory(url: string): Promise<number>;
  getImages(): Promise<Array<{ buffer: Buffer }>>;
}

export class OneDriveProvider implements CloudStorageProvider {
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  async scanDirectory(url: string): Promise<number> {
    if (!process.env.ONEDRIVE_CLIENT_ID || !process.env.ONEDRIVE_CLIENT_SECRET) {
      throw new Error("OneDrive credentials not configured");
    }

    // TODO: Implement actual OneDrive scanning once credentials are available
    // For now return placeholder
    return 0;
  }
}

export class GoogleDriveProvider implements CloudStorageProvider {
  private url: string;
  
  constructor(
    private apiKey: string
  ) {
    this.url = '';
  }

  private extractFolderId(url: string): string {
    try {
      // Handle different URL formats
      const urlStr = decodeURIComponent(url);
      
      // Format: /drive/u/0/folders/FOLDER_ID
      const driveMatch = urlStr.match(/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9-_]+)/);
      if (driveMatch) return driveMatch[1];
      
      // Format: /folders/FOLDER_ID
      const folderMatch = urlStr.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (folderMatch) return folderMatch[1];

      // Format: /d/FOLDER_ID
      const shareMatch = urlStr.match(/d\/([a-zA-Z0-9-_]+)/);
      if (shareMatch) return shareMatch[1];

      throw new Error("Could not find folder ID in URL");
    } catch (error) {
      console.error("URL parsing error:", error);
      throw new Error("Invalid Google Drive URL format");
    }
  }

  async scanDirectory(url: string): Promise<number> {
    if (!process.env.GOOGLE_DRIVE_API_KEY) {
      throw new Error("Google Drive API key not configured");
    }
    
    this.url = url;
    const folderId = this.extractFolderId(url);
    let imageCount = 0;
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        key: process.env.GOOGLE_DRIVE_API_KEY,
        q: `'${folderId}' in parents and (mimeType contains 'image/jpeg' or mimeType contains 'image/png')`,
        pageSize: '1000',
        fields: 'nextPageToken, files(id, mimeType)',
        ...(pageToken && { pageToken })
      });

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('Google Drive API error:', error);
        throw new Error(error.error?.message || 'Failed to scan Google Drive folder');
      }

      const data = await response.json();
      imageCount += data.files?.length || 0;
      pageToken = data.nextPageToken;

    } while (pageToken);

    return imageCount;
  }

  async getImages(): Promise<Array<{ buffer: Buffer }>> {
    if (!process.env.GOOGLE_DRIVE_API_KEY) {
      throw new Error("Google Drive API key not configured");
    }

    const folderId = this.extractFolderId(this.url);
    const images: Array<{ buffer: Buffer }> = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        key: process.env.GOOGLE_DRIVE_API_KEY,
        q: `'${folderId}' in parents and (mimeType contains 'image/jpeg' or mimeType contains 'image/png')`,
        pageSize: '1000',
        fields: 'nextPageToken, files(id)',
        ...(pageToken && { pageToken })
      });

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch images from Google Drive');
      }

      const data = await response.json();
      
      // Download images in parallel with size limit
      const downloadPromises = data.files.map(async (file) => {
        try {
          const imageResponse = await fetch(
            `https://lh3.googleusercontent.com/d/${file.id}=s1000`,
            {
              headers: {
                Authorization: `Bearer ${process.env.GOOGLE_DRIVE_API_KEY}`
              }
            }
          );
          
          if (imageResponse.ok) {
            const arrayBuffer = await imageResponse.arrayBuffer();
            return { buffer: Buffer.from(arrayBuffer) };
          }
          return null;
        } catch (error) {
          console.error(`Failed to download image ${file.id}:`, error);
          return null;
        }
      });

      const downloadedImages = await Promise.all(downloadPromises);
      images.push(...downloadedImages.filter((img): img is { buffer: Buffer } => img !== null));

      pageToken = data.nextPageToken;
    } while (pageToken);

    return images;
  }
}

export function createStorageProvider(url: string): CloudStorageProvider {
  if (url.includes('onedrive')) {
    return new OneDriveProvider(
      process.env.ONEDRIVE_CLIENT_ID!,
      process.env.ONEDRIVE_CLIENT_SECRET!
    );
  }

  if (url.includes('drive.google')) {
    return new GoogleDriveProvider(
      process.env.GOOGLE_DRIVE_API_KEY!
    );
  }

  throw new Error("Unsupported storage provider");
}