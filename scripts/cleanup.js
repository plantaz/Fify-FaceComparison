// cleanup.js - Script to remove unused components
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UI components that appear to be unused
const potentiallyUnusedComponents = [
  'accordion.tsx',
  'aspect-ratio.tsx',
  'avatar.tsx',
  'breadcrumb.tsx',
  'carousel.tsx',
  'chart.tsx',
  'collapsible.tsx',
  'context-menu.tsx',
  'drawer.tsx',
  'hover-card.tsx',
  'input-otp.tsx',
  'menubar.tsx',
  'navigation-menu.tsx',
  'pagination.tsx',
  'radio-group.tsx',
  'resizable.tsx',
  'scroll-area.tsx',
  'sidebar.tsx',
  'skeleton.tsx',
  'slider.tsx',
  'switch.tsx',
  'table.tsx',
  'tabs.tsx',
  'textarea.tsx',
  'toggle-group.tsx',
  'toggle.tsx'
];

const uiComponentsDir = path.join(__dirname, '../client/src/components/ui');
const unusedComponentsBackupDir = path.join(__dirname, '../unused-components-backup');

// Create backup directory if it doesn't exist
if (!fs.existsSync(unusedComponentsBackupDir)) {
  fs.mkdirSync(unusedComponentsBackupDir, { recursive: true });
}

async function checkComponentUsage(componentName) {
  try {
    const { stdout } = await execPromise(
      `grep -r "from \\"@/components/ui/${componentName.replace('.tsx', '')}\\"" --include="*.tsx" --include="*.ts" ./client/src`
    );
    return stdout.trim() !== '';
  } catch (error) {
    // No matches found means component is not used
    return false;
  }
}

async function backupAndRemoveUnusedComponents() {
  console.log('Starting cleanup process...');
  
  let removedCount = 0;
  let keptCount = 0;
  
  // Check each component
  for (const component of potentiallyUnusedComponents) {
    const isUsed = await checkComponentUsage(component);
    const componentPath = path.join(uiComponentsDir, component);
    
    if (!isUsed && fs.existsSync(componentPath)) {
      // Backup the component
      const backupPath = path.join(unusedComponentsBackupDir, component);
      fs.copyFileSync(componentPath, backupPath);
      
      // Remove the component
      fs.unlinkSync(componentPath);
      
      console.log(`Removed unused component: ${component}`);
      removedCount++;
    } else {
      console.log(`Keeping component: ${component} (appears to be used)`);
      keptCount++;
    }
  }
  
  console.log(`Cleanup complete. Removed ${removedCount} unused components. Kept ${keptCount} components.`);
}

backupAndRemoveUnusedComponents().catch(console.error); 