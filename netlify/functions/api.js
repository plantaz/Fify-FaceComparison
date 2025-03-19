import express from 'express';
import serverless from 'serverless-http';
import { registerRoutes } from '../../server/routes.js';
import bodyParser from 'body-parser';
import multer from 'multer';
import { RekognitionClient } from '@aws-sdk/client-rekognition';

// Setup AWS SDK default configuration
process.env.AWS_REGION = 'us-east-1';

// Setup express
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Enable CORS for the Netlify function
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Register routes
registerRoutes(app);

// Export the serverless function
export const handler = serverless(app); 