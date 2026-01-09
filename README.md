<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Multi-Angle Product Studio

AI-powered product image generator using Google Gemini API. Generate professional studio photos from multiple angles using reference images.

## Features

- 🎨 Generate product images from multiple angles (Front, Back, Side, Custom)
- 📸 Upload reference images from local folders
- 🤖 Powered by Google Gemini 2.5 Flash Image API
- ✅ Select and download specific generated images
- 🎯 High-quality text/logo preservation on products
- 📦 Batch download as ZIP files
- 🔧 Configurable output resolution (800px or 1024px)

## Setup

**Prerequisites:** Node.js 16+ and npm

### Option 1: Use UI Settings (Recommended)

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd img-gen-ai-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Enter API key in the app**
   - Open the app in your browser (typically http://localhost:3000)
   - Click the **Settings** icon (⚙️) in the top-left
   - Enter your Gemini API key
   - Start generating!

### Option 2: Use Environment File

1. **Clone and install** (same as above)

2. **Create environment file**
   ```bash
   cp .env.example .env.local
   ```

3. **Add your API key**
   - Open `.env.local`
   - Replace `your_api_key_here` with your actual Gemini API key

4. **Run the app**
   ```bash
   npm run dev
   ```

## Get Your API Key

Get your free Gemini API key at: **https://ai.google.dev/**

## Usage

1. **Select Product Folder**
   - Click "Change Folder" or "Select Product Folder"
   - Choose a folder containing product subfolders with reference images

2. **Configure Settings**
   - Choose angles to generate (Front, Back, Side, or add custom angles)
   - Select output resolution (800x800 or 1024x1024)
   - Enter product description for better results

3. **Generate Images**
   - Click "Generate All" to process all products
   - Or navigate through products and generate individually

4. **Download Results**
   - Select specific images using checkboxes
   - Click "Download This Product" or "Download All Selected"
   - Images are packaged in ZIP files

## Project Structure

```
img-gen-ai-main/
├── src/
│   ├── components/
│   │   └── ImageCard.tsx       # Individual image display component
│   ├── services/
│   │   └── gemini.ts           # Google Gemini API integration
│   ├── App.tsx                 # Main application component
│   └── types.ts                # TypeScript type definitions
├── .env.example                # Example environment variables
├── package.json                # Dependencies and scripts
└── README.md                   # This file
```

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Google Gemini API** - AI image generation
- **JSZip** - Client-side ZIP file creation
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Notes

- The app stores generated images in browser memory (not saved to disk automatically)
- API calls count toward your Gemini API quota
- Larger images (1024px) use more API quota than 800px
- Your API key is never sent to any server except Google's Gemini API

## License

MIT
