
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
execSync('vite build', { stdio: 'inherit' });

console.log('Copying build files...');
fs.cpSync(path.join(__dirname, '..', 'dist', 'public'), publicDir, { recursive: true });

console.log('Building server...');
execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

console.log('Build complete!');
