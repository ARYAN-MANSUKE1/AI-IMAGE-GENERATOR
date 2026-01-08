
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

/**
 * Check if a model is an Imagen model (uses different API)
 */
const isImagenModel = (model: string): boolean => {
  return model.startsWith('imagen-');
};

/**
 * Generate product image using Imagen API (text-to-image only)
 * Note: Imagen doesn't support reference images, generates from text prompts only
 */
const generateWithImagen = async (
  productName: string,
  productDescription: string,
  angle: string,
  model: string,
  targetWidth: number = 800,
  retryCount = 0
): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not defined in environment variables');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const prompt = `High-fidelity studio product photography of ${productName}.

CAMERA ANGLE: ${angle}

PRODUCT DESCRIPTION:
${productDescription}

ENVIRONMENT:
- Pure white seamless studio background
- Soft, professional, multi-directional studio lighting
- Natural shadows only
- Photorealistic textures
- Sharp focus
- Commercial e-commerce quality

Generate one product image at the specified angle.`;

    const response = await ai.models.generateImages({
      model: model,
      prompt: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '1:1',
        personGeneration: 'allow_adult'
      }
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("No image data returned from Imagen model.");
    }

    // Get the first generated image
    const generatedImage = response.generatedImages[0];
    
    // Convert the image to base64 data URL
    // The image property contains the actual image data
    const imageData = generatedImage.image;
    
    // If the image is already a data URL, return it
    if (typeof imageData === 'string' && imageData.startsWith('data:')) {
      return imageData;
    }
    
    // Otherwise, we need to convert it
    // The SDK might return it as a Blob or ArrayBuffer
    if (imageData instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageData);
      });
    }
    
    throw new Error("Unexpected image format from Imagen model.");
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateWithImagen(productName, productDescription, angle, model, targetWidth, retryCount + 1);
    }
    throw err;
  }
};

/**
 * Transforms an image using Gemini model with specified prompt.
 */
export const transformImage = async (
  file: File,
  prompt: string,
  model: string = 'gemini-2.5-flash-image',
  retryCount = 0
): Promise<string> => {
  // Always use a new instance with direct API key access
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not defined in environment variables');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: file.type || 'image/png'
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    let resultBase64 = '';
    const candidate = response.candidates?.[0];
    
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          resultBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!resultBase64) {
      throw new Error("No image data returned from model.");
    }

    return `data:image/png;base64,${resultBase64}`;
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return transformImage(file, prompt, model, retryCount + 1);
    }
    throw err;
  }
};

/**
 * Generate product image from multiple reference images at specific angle
 */
export const generateProductAngle = async (
  referenceFiles: File[],
  productName: string,
  productDescription: string,
  angle: string,
  model: string = 'gemini-2.5-flash-image',
  targetWidth: number = 800,
  retryCount = 0
): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not defined in environment variables');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  console.log(`🎨 Generating ${angle} for "${productName}" using ${model}`);
  
  // Imagen models use a different API
  if (isImagenModel(model)) {
    return generateWithImagen(productName, productDescription, angle, model, targetWidth, retryCount);
  }
  
  try {
    // Convert all reference images to base64
    const imageParts = await Promise.all(
      referenceFiles.map(async (file) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        return {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/png'
          }
        };
      })
    );

    const prompt = `High-fidelity studio product photography of ${productName} based strictly on the ${referenceFiles.length} provided visual reference images.

IMAGE COUNT RULE (ABSOLUTE):
Generate exactly ONE image.
The image must contain ONLY ONE single, isolated camera view.

CAMERA ANGLE (MANDATORY):
${angle}

FORBIDDEN:
- Collages
- Grids
- Split screens
- Multiple views in one image
- Picture-in-picture
- Comparison layouts

REFERENCE HANDLING:
The ${referenceFiles.length} reference images show the product from different angles.
DO NOT copy their layout or framing.
Use references ONLY to match:
- Product appearance, materials, colors, branding
- Proportions and construction details
- How the product is presented (worn/isolated)

SUBJECT PRESENTATION:
Match the presentation shown in the reference images exactly.
- If the product is worn by a human in the references, show it worn.
- If the product is isolated in the references, show it isolated.
Do NOT introduce or remove humans.

PRODUCT & MATERIAL ACCURACY:
${productDescription}

ENVIRONMENT:
- Pure white seamless studio background
- Soft, professional, multi-directional studio lighting
- Natural shadows only
- Photorealistic textures
- Sharp focus
- Commercial e-commerce quality
- ${targetWidth}x${targetWidth}px dimensions

VALIDATION RULE:
If more than one angle appears in the image, the output is INVALID.

Generate the ${angle} view now.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          ...imageParts,
          {
            text: prompt
          }
        ]
      }
    });

    let resultBase64 = '';
    const candidate = response.candidates?.[0];
    
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          resultBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!resultBase64) {
      throw new Error("No image data returned from model.");
    }

    return `data:image/png;base64,${resultBase64}`;
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateProductAngle(referenceFiles, productName, productDescription, angle, model, targetWidth, retryCount + 1);
    }
    throw err;
  }
};

/**
 * Generate all product angles in a single batch API call
 * 
 * NOTE: Gemini's generateContent API supports multiple images in the input
 * and can generate multiple images in the output when properly prompted.
 * This function leverages that capability to reduce API calls and costs.
 * 
 * The model can return multiple inlineData parts in the response, each containing
 * a separate generated image. We extract all parts and match them to the requested angles.
 */
export const generateAllProductAngles = async (
  referenceFiles: File[],
  productName: string,
  productDescription: string,
  angles: Array<{ name: string; prompt: string }>,
  model: string = 'gemini-2.5-flash-image',
  targetWidth: number = 800,
  retryCount = 0
): Promise<string[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not defined in environment variables');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  console.log(`\ud83d\udcac Gemini API: Preparing to generate ${angles.length} angles from ${referenceFiles.length} reference images`);
  
  try {
    // Convert all reference images to base64
    const imageParts = await Promise.all(
      referenceFiles.map(async (file) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        return {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/png'
          }
        };
      })
    );

    // Build prompt for all angles
    const angleDescriptions = angles.map((angle, idx) => `${idx + 1}. ${angle.name}: ${angle.prompt}`).join('\n');
    
    const prompt = `High-fidelity studio product photography of ${productName} based strictly on the ${referenceFiles.length} provided visual reference images.

CRITICAL INSTRUCTION: Generate EXACTLY ${angles.length} separate images, one for each angle specified below. Each image must be completely independent and show only ONE camera angle.

ANGLES TO GENERATE:
${angleDescriptions}

IMAGE COUNT RULE (ABSOLUTE):
Generate exactly ${angles.length} images.
Each image must contain ONLY ONE single, isolated camera view.

FORBIDDEN FOR EACH IMAGE:
- Collages
- Grids
- Split screens
- Multiple views in one image
- Picture-in-picture
- Comparison layouts

REFERENCE HANDLING:
The ${referenceFiles.length} reference images show the product from different angles.
DO NOT copy their layout or framing.
Use references ONLY to match:
- Product appearance, materials, colors, branding
- Proportions and construction details
- How the product is presented (worn/isolated)

SUBJECT PRESENTATION:
Match the presentation shown in the reference images exactly.
- If the product is worn by a human in the references, show it worn.
- If the product is isolated in the references, show it isolated.
Do NOT introduce or remove humans.

PRODUCT & MATERIAL ACCURACY:
${productDescription}

ENVIRONMENT FOR ALL IMAGES:
- Pure white seamless studio background
- Soft, professional, multi-directional studio lighting
- Natural shadows only
- Photorealistic textures
- Sharp focus
- Commercial e-commerce quality
- ${targetWidth}x${targetWidth}px dimensions

Generate all ${angles.length} angle views now, returning them as separate images.`;

    console.log(`\u23f3 Sending request to Gemini ${model}...`);
    const requestStartTime = Date.now();
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          ...imageParts,
          {
            text: prompt
          }
        ]
      }
    });

    const requestDuration = ((Date.now() - requestStartTime) / 1000).toFixed(2);
    console.log(`\u2705 Response received in ${requestDuration}s`);

    const candidate = response.candidates?.[0];
    const resultImages: string[] = [];
    
    if (candidate?.content?.parts) {
      console.log(`\ud83d\udccb Response contains ${candidate.content.parts.length} parts`);
      console.log(`\ud83d\udccb Response contains ${candidate.content.parts.length} parts`);
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          resultImages.push(`data:image/png;base64,${part.inlineData.data}`);
          console.log(`  \u2713 Extracted image ${resultImages.length}`);
        }
      }
    }

    console.log(`🖼️ Total images extracted: ${resultImages.length} (expected: ${angles.length})`);

    if (resultImages.length === 0) {
      throw new Error("No image data returned from model.");
    }

    // If we got fewer images than angles, pad with the last image or throw error
    if (resultImages.length < angles.length) {
      console.warn(`⚠️ Expected ${angles.length} images but got ${resultImages.length}. Using fallback strategy.`);
      // Duplicate last image to fill the gap
      while (resultImages.length < angles.length) {
        resultImages.push(resultImages[resultImages.length - 1]);
        console.log(`  ↻ Duplicating image to fill gap (${resultImages.length}/${angles.length})`);
      }
    }

    console.log(`✅ Batch generation complete! Returning ${angles.length} images.`);
    return resultImages.slice(0, angles.length);
  } catch (err: any) {
    console.error(`❌ API Error:`, err.message || err);
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`🔄 Retrying in ${delay}ms... (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateAllProductAngles(referenceFiles, productName, productDescription, angles, model, targetWidth, retryCount + 1);
    }
    throw err;
  }
};

/**
 * Performs a high-quality local resize using the browser's Canvas API.
 * This is faster and more precise for specific resolution requirements.
 */
export const resizeImageLocally = async (file: File, targetWidth: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.height / img.width;
      const targetHeight = targetWidth * aspectRatio;
      
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return reject(new Error("Failed to get canvas context"));
      
      // Use high quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = URL.createObjectURL(file);
  });
};
