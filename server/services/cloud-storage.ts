import { DriveUrlInput } from "@shared/schema";

export interface CloudStorageProvider {
  scanDirectory(url: string): Promise<number>;
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
  constructor(
    private apiKey: string
  ) {}

  private extractFolderId(url: string): string {
    // Handle both folder URLs and shared URLs
    const folderMatch = url.match(/folders\/([a-zA-Z0-9-_]+)/);
    if (folderMatch) return folderMatch[1];

    const shareMatch = url.match(/d\/([a-zA-Z0-9-_]+)/);
    if (shareMatch) return shareMatch[1];

    throw new Error("Invalid Google Drive URL format");
  }

  async scanDirectory(url: string): Promise<number> {
    if (!process.env.GOOGLE_DRIVE_API_KEY) {
      throw new Error("Google Drive API key not configured");
    }

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