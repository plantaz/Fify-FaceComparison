
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the server/public directory exists
const publicDir = path.join(__dirname, '..', 'server', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Building client...');
execSync('npm run build', { stdio: 'inherit' });

// Copy dist contents to server/public
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  console.log('Copying build files to server/public...');
  fs.cpSync(distDir, publicDir, { recursive: true });
}

console.log('Build complete!');
