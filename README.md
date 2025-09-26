# CV Reformat

A full-stack application for reformatting CVs using AI, built with Node.js, Express, TypeScript, and Supabase.

## Project Structure

```
cv_reformat/
├── back-end/          # Node.js + Express + TypeScript backend
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   ├── utils/         # Utility functions
│   │   └── app.ts         # Main application file
│   ├── package.json
│   └── tsconfig.json
└── front-end/         # Frontend application (to be implemented)
```

## Features

- **File Upload**: Multer middleware for handling file uploads
- **AI Integration**: OpenAI API integration for CV processing
- **Database**: PostgreSQL database hosted on Supabase
- **TypeScript**: Full TypeScript support for type safety

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Supabase
- **File Upload**: Multer
- **AI**: OpenAI API

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cv_reformat/back-end
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Follow the [Supabase Setup Guide](./back-end/SUPABASE_SETUP.md)
   - Create a `.env` file with your Supabase credentials

4. **Run the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:5000`

### Environment Variables

Create a `.env` file in the `back-end` directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Environment
NODE_ENV=development
PORT=5000
```

## API Endpoints

### File Operations
- `POST /api/file/upload` - Upload CV file for processing
- `GET /` - Health check endpoint

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server

## Deployment

### Backend Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables
3. Deploy to your preferred platform (Heroku, Vercel, etc.)



## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
