export function validateDriveUrl(url: string): { valid: boolean; type?: 'onedrive' | 'gdrive' } {
  try {
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes('onedrive')) {
      return { valid: true, type: 'onedrive' };
    }
    
    if (urlObj.hostname.includes('drive.google')) {
      return { valid: true, type: 'gdrive' };
    }
    
    return { valid: false };
  } catch {
    return { valid: false };
  }
}
