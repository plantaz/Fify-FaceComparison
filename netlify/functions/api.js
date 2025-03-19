import express from 'express';
import serverless from 'serverless-http';
import { registerRoutes } from '../../server/routes.js';
import bodyParser from 'body-parser';
import multer from 'multer';

// Setup express
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Register routes
registerRoutes(app);

// Export the serverless function
export const handler = serverless(app); 