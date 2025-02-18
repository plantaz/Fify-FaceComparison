import { DriveUrlInput } from "@shared/schema";

export interface CloudStorageProvider {
  scanDirectory(url: string): Promise<number>;
  getImages(): Promise<Array<{ buffer: Buffer; id?: string }>>;
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
    return 0;
  }

  async getImages(): Promise<Array<{ buffer: Buffer; id?: string }>> {
    return [];
  }
}

export class GoogleDriveProvider implements CloudStorageProvider {
  private url: string;

  constructor(private apiKey: string) {
    this.url = '';
  }

  private extractFolderId(url: string): string {
    try {
      console.log('Processing URL:', url);
      const urlStr = decodeURIComponent(url);
      console.log('Decoded URL:', urlStr);

      const patterns = [
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9-_]+)/,
        /\/d\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/
      ];

      for (const pattern of patterns) {
        console.log('Trying pattern:', pattern);
        const match = urlStr.match(pattern);
        if (match) {
          console.log('Match found:', match);
          if (match[1]) return match[1];
        }
      }

      const lastSegment = urlStr.split('/').filter(Boolean).pop();
      if (lastSegment && lastSegment.length > 10) {
        return lastSegment;
      }

      throw new Error("Could not find folder ID in URL");
    } catch (error) {
      console.error("URL parsing error:", error);
      throw new Error("Invalid Google Drive URL format");
    }
  }

  async scanDirectory(url: string): Promise<number> {
    this.url = url;
    const folderId = this.extractFolderId(url);
    let imageCount = 0;
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        key: this.apiKey,
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

  async getImages(): Promise<Array<{ buffer: Buffer; id?: string }>> {
    if (!this.url) {
      console.error('URL not set in provider');
      throw new Error("Drive URL not found");
    }

    console.log('Getting images for URL:', this.url);
    const folderId = this.extractFolderId(this.url);
    const images: Array<{ buffer: Buffer, id: string }> = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        key: this.apiKey,
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

      const downloadPromises = data.files.map(async (file: { id: string }) => {
        try {
          const imageResponse = await fetch(
            `https://lh3.googleusercontent.com/d/${file.id}=s1000`,
            {
              headers: {
                Authorization: `Bearer ${this.apiKey}`
              }
            }
          );

          if (imageResponse.ok) {
            const arrayBuffer = await imageResponse.arrayBuffer();
            return { buffer: Buffer.from(arrayBuffer), id: file.id };
          }
          return null;
        } catch (error) {
          console.error(`Failed to download image ${file.id}:`, error);
          return null;
        }
      });

      const downloadedImages = await Promise.all(downloadPromises);
      images.push(...downloadedImages.filter((img): img is { buffer: Buffer, id: string } => img !== null));

      pageToken = data.nextPageToken;
    } while (pageToken);

    return images;
  }
}

export function createStorageProvider(url: string, apiKey?: string): CloudStorageProvider {
  if (url.includes('onedrive')) {
    return new OneDriveProvider(
      process.env.ONEDRIVE_CLIENT_ID!,
      process.env.ONEDRIVE_CLIENT_SECRET!
    );
  }

  if (url.includes('drive.google')) {
    if (!apiKey) {
      throw new Error("Google Drive API key is required");
    }
    return new GoogleDriveProvider(apiKey);
  }

  throw new Error("Unsupported storage provider");
}