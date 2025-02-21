
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define directories
const publicDir = path.join(__dirname, '..', 'server', 'public');
const distPublicDir = path.join(__dirname, '..', 'dist', 'public');

// Clean and create directories
console.log('Preparing directories...');
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// Build client
console.log('Building client...');
execSync('vite build', { stdio: 'inherit' });

// Copy build files
console.log('Copying build files...');
fs.cpSync(distPublicDir, publicDir, { recursive: true });

// Build server
console.log('Building server...');
execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

console.log('Build complete!');
