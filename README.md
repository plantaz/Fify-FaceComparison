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
