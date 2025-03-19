export function validateDriveUrl(url: string): { valid: boolean; type?: 'gdrive' } {
  try {
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes('drive.google')) {
      return { valid: true, type: 'gdrive' };
    }
    
    return { valid: false };
  } catch (e) {
    return { valid: false };
  }
}
