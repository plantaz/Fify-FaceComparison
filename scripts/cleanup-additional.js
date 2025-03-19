// cleanup-additional.js - Script to remove additional unused files
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Additional files that might be unused
const potentiallyUnusedFiles = [
  { path: 'client/src/hooks/use-mobile.tsx', searchPattern: 'from "@/hooks/use-mobile"' }
];

const unusedFilesBackupDir = path.join(__dirname, '../unused-additional-backup');

// Create backup directory if it doesn't exist
if (!fs.existsSync(unusedFilesBackupDir)) {
  fs.mkdirSync(unusedFilesBackupDir, { recursive: true });
}

async function checkFileUsage(searchPattern) {
  try {
    const { stdout } = await execPromise(
      `grep -r "${searchPattern}" --include="*.tsx" --include="*.ts" ./client/src`
    );
    
    // Check if the results are from actual code files (not the file itself or backup files)
    const lines = stdout.trim().split('\n').filter(line => 
      !line.includes('unused-components-backup') && 
      !line.includes(searchPattern.replace(/"/g, ''))
    );
    
    return lines.length > 0;
  } catch (error) {
    // No matches found means file is not used
    return false;
  }
}

async function backupAndRemoveUnusedFiles() {
  console.log('Starting additional cleanup process...');
  
  let removedCount = 0;
  let keptCount = 0;
  
  // Check each file
  for (const file of potentiallyUnusedFiles) {
    const isUsed = await checkFileUsage(file.searchPattern);
    const filePath = path.join(__dirname, '..', file.path);
    
    if (!isUsed && fs.existsSync(filePath)) {
      // Create subdirectories in backup if needed
      const relativePath = file.path.split('/');
      const fileName = relativePath.pop();
      const subDir = path.join(unusedFilesBackupDir, ...relativePath);
      
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      
      // Backup the file
      const backupPath = path.join(subDir, fileName);
      fs.copyFileSync(filePath, backupPath);
      
      // Remove the file
      fs.unlinkSync(filePath);
      
      console.log(`Removed unused file: ${file.path}`);
      removedCount++;
    } else {
      console.log(`Keeping file: ${file.path} (appears to be used)`);
      keptCount++;
    }
  }
  
  console.log(`Additional cleanup complete. Removed ${removedCount} unused files. Kept ${keptCount} files.`);
}

backupAndRemoveUnusedFiles().catch(console.error); 