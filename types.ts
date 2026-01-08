
export interface ProcessingItem {
  id: string;
  file: File;
  handle: FileSystemFileHandle;
  parentHandle: FileSystemDirectoryHandle;
  relativePath: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  originalUrl: string;
  resultUrl?: string;
  error?: string;
  progress: number;
  angle?: string;
}

export interface BatchConfig {
  mode: 'ai' | 'resize';
  prompt: string;
  targetWidth: number;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  model: string;
  concurrency: number;
}

export type AppStatus = 'idle' | 'scanning' | 'ready' | 'processing' | 'done';

export interface AngleConfig {
  name: string;
  prompt: string;
  enabled: boolean;
}

export interface ImageFile {
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  name: string;
  path: string;
  angle?: string;
}

export interface Product {
  name: string;
  images: ImageFile[];
  generatedImages?: ImageFile[];
  extractedText?: string;
}

export type ModelName = 'gemini-2.5-flash-image' | 'gemini-2.5-flash-image-preview';

export type GeminiModel = 
  | 'gemini-2.0-flash-exp'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash-8b'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash';

export interface ModelInfo {
  id: GeminiModel;
  name: string;
  description: string;
  category: 'text-vision' | 'image-generation';
  capabilities: string[];
  speed: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  quality: 'standard' | 'high' | 'ultra-high';
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    description: 'Latest experimental model - Fast and efficient',
    category: 'text-vision',
    capabilities: ['OCR', 'Text Analysis', 'Image Understanding'],
    speed: 'ultra-fast',
    quality: 'high'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Best balance of speed and intelligence',
    category: 'text-vision',
    capabilities: ['OCR', 'Text Analysis', 'Balanced Performance'],
    speed: 'fast',
    quality: 'high'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'High-capability for deep reasoning',
    category: 'text-vision',
    capabilities: ['OCR', 'Complex Analysis', 'Deep Reasoning'],
    speed: 'medium',
    quality: 'ultra-high'
  },
  {
    id: 'gemini-2.5-flash-8b',
    name: 'Gemini 2.5 Flash-8B',
    description: 'Ultra-efficient for massive scale',
    category: 'text-vision',
    capabilities: ['OCR', 'Fast Processing', 'Cost Efficient'],
    speed: 'ultra-fast',
    quality: 'standard'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Reliable older version with proven performance',
    category: 'text-vision',
    capabilities: ['OCR', 'Text Analysis', 'Stable'],
    speed: 'medium',
    quality: 'high'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and reliable older version',
    category: 'text-vision',
    capabilities: ['OCR', 'Fast Processing', 'Stable'],
    speed: 'fast',
    quality: 'standard'
  }
];
