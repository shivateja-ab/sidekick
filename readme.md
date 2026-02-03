# SideKick - AI-Powered Visual Assistant

An AI-powered navigation assistant for visually impaired users, built with real-time streaming using Server-Sent Events (SSE) and Google Gemini 3 API.

## 🎯 Features

- **Real-time Image Analysis**: Capture images and get instant AI-powered descriptions
- **Streaming Responses**: Server-Sent Events (SSE) for progressive text delivery
- **Text-to-Speech**: Immediate audio feedback using Web Speech API
- **Camera Integration**: Direct camera access for capturing surroundings
- **Rate Limit Protection**: Built-in throttling to prevent API limit exceeded errors

## 🏗️ Architecture

### Frontend (Client-Side)
- **Pure JavaScript**: ES6 Modules, no framework dependencies
- **Camera Capture**: HTML5 MediaDevices API
- **SSE Client**: Real-time stream processing
- **Text-to-Speech**: Web Speech API for audio output

### Backend (Serverless)
- **Vercel Edge Functions**: Serverless API endpoints
- **Gemini 3 API**: Google's multimodal AI for image analysis
- **SSE Streaming**: Progressive response delivery

## 📁 Project Structure

```
SideKick/
├── index.html              # Landing page
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main application controller
│   ├── api.js              # API client (SSE streaming)
│   ├── camera.js           # Camera handling
│   ├── config.js           # Configuration
│   └── speech.js           # Text-to-speech
├── assets/
│   ├── icon-192.png
│   └── icon-512.png
├── api/
│   └── v1/
│       ├── health.js       # Health check endpoint
│       └── analyze/
│           └── stream.js   # SSE streaming endpoint
├── vercel.json             # Vercel configuration
└── package.json           # Dependencies
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Gemini API key from [Google AI Studio](https://aistudio.google.com/)
- Vercel account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd SideKick
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create `.env.local` in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3-pro-preview
   ```

4. **Start development server**
   ```bash
   npm run dev:local
   ```

5. **Open in browser**
   - Navigate to `http://localhost:3000`
   - Click "Start Camera" to enable camera preview
   - Click "Capture & Analyze" to analyze images

## 📡 API Endpoints

### Health Check
```
GET /api/v1/health
```
Returns server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Image Analysis (SSE Stream)
```
POST /api/v1/analyze/stream
Content-Type: application/json

{
  "image": "base64_encoded_image_string"
}
```

**Response:** Server-Sent Events stream
```
event: start
data: {"status":"started"}

event: chunk
data: {"text":"partial description text"}

event: complete
data: {"done":true}
```

## 🔄 How It Works

### Flow Diagram

```
User clicks "Capture & Analyze"
  ↓
Camera captures image frame → Blob
  ↓
Convert Blob to Base64
  ↓
POST /api/v1/analyze/stream (with base64 image)
  ↓
Vercel Serverless Function receives request
  ↓
Initialize Gemini SDK with API key
  ↓
Call Gemini API: generateContentStream()
  ↓
Gemini processes image + prompt
  ↓
Stream chunks back via SSE
  ↓
Client receives chunks → Updates UI → Text-to-Speech
```

### Key Components

1. **Image Capture** (`js/camera.js`)
   - Uses HTML5 Canvas to capture video frame
   - Converts to JPEG Blob

2. **API Client** (`js/api.js`)
   - Converts Blob to Base64
   - Makes POST request to server
   - Processes SSE stream in real-time
   - Triggers callbacks for each event

3. **Serverless Function** (`api/v1/analyze/stream.js`)
   - Receives base64 image
   - Calls Gemini API with streaming
   - Forwards chunks via SSE
   - Handles errors gracefully

4. **App Controller** (`js/app.js`)
   - Manages UI state
   - Handles user interactions
   - Coordinates camera, API, and speech
   - Enforces rate limiting (4 seconds between captures)

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Your Google Gemini API key | Required |
| `GEMINI_MODEL` | Gemini model to use | `gemini-3-pro-preview` |

### Client Configuration (`js/config.js`)

- **API Base URL**: `/api/v1` (relative path)
- **Camera Settings**: 640x480, front-facing preferred
- **Throttling**: 4 seconds minimum between captures

## 🚢 Deployment

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push
   ```

2. **Connect to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com)
   - Import your GitHub repository
   - Add environment variables:
     - `GEMINI_API_KEY`
     - `GEMINI_MODEL` (optional)

3. **Deploy**
   - Vercel will auto-deploy on push
   - Your app will be available at `https://your-project.vercel.app`

### Vercel Configuration

The `vercel.json` file configures:
- **SPA Routing**: All non-API routes serve `index.html`
- **Static Files**: Serves `css/`, `js/`, `assets/` directly
- **API Routes**: `/api/*` handled by serverless functions

## ⚠️ Rate Limiting

### Gemini API Limits (Free Tier)
- **15 requests per minute**
- Rolling 60-second window

### Built-in Protection
- **Client-side throttling**: 4 seconds minimum between captures
- Prevents exceeding API limits
- Shows wait message if clicked too soon

### Best Practices
- Wait 4+ seconds between captures
- Don't open multiple tabs (each makes independent requests)
- Previous requests count toward the limit (rolling window)

## 🛠️ Tech Stack

### Frontend
- **Vanilla JavaScript** (ES6 Modules)
- **HTML5 APIs**: MediaDevices, Canvas, Web Speech
- **Server-Sent Events** (SSE) for streaming

### Backend
- **Vercel Edge Functions** (Node.js runtime)
- **@google/genai SDK** for Gemini API
- **ReadableStream** for SSE responses

### Deployment
- **Vercel** for hosting and serverless functions

## 📝 Scripts

```bash
npm run dev:local    # Start Vercel dev server
npm run dev:api      # Start API server only (port 3001)
npm run deploy       # Deploy to production
npm run deploy:preview # Deploy preview
```

## 🐛 Troubleshooting

### Camera Not Working
- Ensure you're using `localhost` (not `127.0.0.1`)
- Grant browser camera permissions
- Check browser console for errors

### Rate Limit Errors (429)
- Wait 4+ seconds between captures
- Close other tabs/windows
- Wait 1 minute for rate limit window to reset

### API Key Errors
- Verify `GEMINI_API_KEY` is set in `.env.local` (local) or Vercel dashboard (production)
- Restart dev server after changing `.env.local`
- Check API key is valid at [Google AI Studio](https://aistudio.google.com/)

### Stream Errors
- Check browser console for detailed logs
- Check server logs (terminal running `vercel dev`)
- Verify API key is configured correctly
- Ensure image is being captured (check blob size in logs)

## 📄 License

MIT

## 👤 Author

Your Name

## 🙏 Acknowledgments

- Google Gemini API for multimodal AI capabilities
- Vercel for serverless hosting
- Web Standards for camera and speech APIs
