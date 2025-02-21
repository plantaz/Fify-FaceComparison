
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define directories
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const serverPublicDir = path.join(rootDir, 'server', 'public');

// Ensure directories exist
console.log('Creating directories...');
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(serverPublicDir, { recursive: true });

// Build client
console.log('Building client...');
execSync('vite build', { stdio: 'inherit' });

// Copy client build to server/public
console.log('Copying client build to server/public...');
fs.cpSync(path.join(distDir, 'public'), serverPublicDir, { 
  recursive: true, 
  force: true 
});

// Build server
console.log('Building server...');
execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { 
  stdio: 'inherit' 
});

console.log('Build complete!');
