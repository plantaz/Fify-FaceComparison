# Face Detection in Cloud Storage

A SaaS platform that helps users find specific faces in their cloud storage directories using AWS Rekognition.

## Features

- Support for Google Drive directories
- Face detection and comparison using AWS Rekognition
- Multi-language support (English and Portuguese-BR)

## Development Setup

1. Clone the repository
2. Create a `.env` file based on `.env.example`:
```env
NODE_ENV=development

# Required API credentials
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# Database
DATABASE_URL=your_database_url
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`.

## Deploying to Netlify

This application can be deployed to Netlify as a fullstack application using Netlify Functions:

1. Create a new site in Netlify
2. Connect it to your GitHub repository
3. Set the following build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: 20.x (or later)

4. Set up the required environment variables in Netlify:
   - `DATABASE_URL`: Your database connection string (e.g. Neon, Supabase)
   - `NODE_ENV`: Set to `development` (we're using development mode for simplicity)

5. Make sure you have the `netlify.toml` file in your repository root with the following content:
```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

6. Ensure you have the serverless function set up in `netlify/functions/api.js` that adapts your Express app to Netlify Functions.

7. Push all changes to your repository.

Note: In this configuration, users will need to provide their own Google Drive API key and AWS credentials when using the app, as the application doesn't store these credentials on the server.

## API Keys and Credentials

### Google Drive API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Drive API
4. Create credentials (API key)
5. Restrict the API key to Google Drive API only

### AWS Credentials
1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam)
2. Create a new IAM user or select an existing one
3. Attach the `AmazonRekognitionFullAccess` policy
4. Generate access key and secret key

For more details on creating API keys and credentials, refer to the official documentation:
- [Google Drive API Documentation](https://developers.google.com/drive/api/v3/quickstart/js)
- [AWS IAM Documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)

## Technologies Used

- Frontend:
  - React with TypeScript
  - TanStack Query for data fetching
  - Tailwind CSS for styling
  - shadcn/ui for components
- Backend:
  - Express.js
  - AWS Rekognition for face detection
  - PostgreSQL for data storage
  - Drizzle ORM for database operations
  - Serverless-http for Netlify Functions
