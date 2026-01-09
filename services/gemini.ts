
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
  apiKey: string,
  retryCount = 0
): Promise<string> => {
  if (!apiKey) {
    throw new Error('API Key is required. Please enter your Gemini API key in the settings.');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const prompt = `!!CRITICAL INSTRUCTION!! ANY TEXT VISIBLE ON THE PRODUCT MUST BE RENDERED AT 4K ULTRA-HD RAZOR-SHARP QUALITY WITH ZERO BLUR.

High-fidelity studio product photography of ${productName}.

CAMERA ANGLE: ${angle}

PRODUCT DESCRIPTION:
${productDescription}

🚨 TEXT RENDERING REQUIREMENTS (ABSOLUTE MAXIMUM PRIORITY - OVERRIDES ALL OTHER SETTINGS) 🚨
IF ANY TEXT EXISTS ON THIS PRODUCT:
- Render text at 4K/8K ultra-high definition resolution
- Text sharpness: MAXIMUM - sharper than professional print quality
- ZERO blur, ZERO noise, ZERO compression artifacts on text areas
- Every letter must be PERFECTLY crisp with clean edges
- Text must be THE SHARPEST element in the entire image
- NO text simplification, approximation, or reconstruction
- Copy text EXACTLY, LETTER-BY-LETTER with 100% accuracy
- Text clarity is MORE IMPORTANT than anything else in the image
- If you must choose between sharp text vs sharp product, CHOOSE SHARP TEXT

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
        personGeneration: 'allow_adult' as any
      }
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("No image data returned from Imagen model.");
    }

    // Get the first generated image
    const generatedImage = response.generatedImages[0];
    
    // Convert the image to base64 data URL
    // The image property contains the actual image data
    const imageData = generatedImage.image as any;
    
    // If the image is already a data URL, resize and return it
    if (typeof imageData === 'string' && imageData.startsWith('data:')) {
      return await resizeBase64Image(imageData, targetWidth);
    }
    
    // Otherwise, we need to convert it
    // The SDK might return it as a Blob or ArrayBuffer
    if (imageData instanceof Blob) {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageData);
      });
      return await resizeBase64Image(base64Image, targetWidth);
    }
    
    throw new Error("Unexpected image format from Imagen model.");
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateWithImagen(productName, productDescription, angle, model, targetWidth, apiKey, retryCount + 1);
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
  apiKey?: string,
  retryCount = 0
): Promise<string> => {
  // Always use a new instance with direct API key access
  const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error('API Key is required. Please enter your Gemini API key in the settings.');
  }
  const ai = new GoogleGenAI({ apiKey: key });
  
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
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1'
        }
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

    const base64Image = `data:image/png;base64,${resultBase64}`;
    return await resizeBase64Image(base64Image, 800);
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return transformImage(file, prompt, model, key, retryCount + 1);
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
  apiKey?: string,
  retryCount = 0
): Promise<string> => {
  const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error('API Key is required. Please enter your Gemini API key in the settings.');
  }
  const ai = new GoogleGenAI({ apiKey: key });
  
  console.log(`🎨 Generating ${angle} for "${productName}" using ${model}`);
  
  // Imagen models use a different API
  if (isImagenModel(model)) {
    return generateWithImagen(productName, productDescription, angle, model, targetWidth, key, retryCount);
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

🚨🚨🚨 BRANDING & TEXT PRESERVATION (CRITICAL - HIGHEST PRIORITY) 🚨🚨🚨

Task: Preserve and render ALL branding, logos, and text from the Reference Images with ABSOLUTE ACCURACY.

Branding Requirements:

1. STRICT TEXT RENDERING:
   - Copy ALL text/logos EXACTLY as they appear in reference images
   - Maintain exact spelling, capitalization, font style, and layout
   - If you see "USI UNIVERSAL" → render exactly "USI UNIVERSAL"
   - If you see "usi" → render exactly "usi"
   - ZERO HALLUCINATION: No extra letters, symbols, or gibberish characters
   - The spelling must be 100% accurate, character-by-character

2. SMART PLACEMENT:
   - Automatically detect the logo placement from reference images
   - Maintain the EXACT same position relative to product features
   - For different angles, intelligently place branding on equivalent surfaces
   - Examples: center-chest for tees, outer-cuff for gloves, ear-cup for headsets

3. PHYSICS-BASED MAPPING:
   - Logo must follow 3D contours, fabric folds, and lighting of the product
   - If leather: logo should look printed/embossed with appropriate depth
   - If knit fabric: show slight texture bleed through logo area
   - If smooth fabric: clean, flat application
   - Shadows and highlights must interact naturally with logo

4. ULTRA-HIGH TEXT QUALITY:
   - Render all text at 4K/8K resolution (sharper than the product itself)
   - Every letter must be PERFECTLY CRISP with razor-sharp edges
   - ZERO blur, noise, or compression artifacts on text
   - Text should look like vector graphics (infinitely sharp)
   - Text quality is MORE IMPORTANT than product quality

5. CONSTRAINT:
   - Maintain 100% of the original product's geometry, color, and material
   - Change ONLY the pixels in the branding zone for the new angle
   - Do NOT alter product shape, color, or construction

VALIDATION:
Before returning the image, verify:
✓ All text from references is spelled correctly
✓ Logo placement matches reference images
✓ Text is razor-sharp and readable
✓ Branding follows product contours naturally

PRODUCT & MATERIAL ACCURACY:
${productDescription}

ENVIRONMENT:
- Pure white seamless studio background
- Soft, professional, multi-directional studio lighting
- Natural shadows only
- Photorealistic textures
- Sharp focus throughout (text EXTRA sharp)
- Commercial e-commerce quality
- ${targetWidth}x${targetWidth}px dimensions

VALIDATION RULE:
If more than one angle appears in the image, the output is INVALID.

Generate the ${angle} view now with PERFECT branding preservation.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          ...imageParts,
          {
            text: prompt
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1'
        }
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

    const base64Image = `data:image/png;base64,${resultBase64}`;
    return await resizeBase64Image(base64Image, targetWidth);
  } catch (err: any) {
    if (retryCount < 3 && (err.status >= 500 || err.status === 429)) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateProductAngle(referenceFiles, productName, productDescription, angle, model, targetWidth, key, retryCount + 1);
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
  apiKey?: string,
  retryCount = 0
): Promise<string[]> => {
  const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error('API Key is required. Please enter your Gemini API key in the settings.');
  }
  const ai = new GoogleGenAI({ apiKey: key });
  
  console.log(`💬 Gemini API: Preparing to generate ${angles.length} angles from ${referenceFiles.length} reference images`);
  
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

    console.log(`⏳ Sending request to Gemini ${model}...`);
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
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1'
        }
      }
    });

    const requestDuration = ((Date.now() - requestStartTime) / 1000).toFixed(2);
    console.log(`✅ Response received in ${requestDuration}s`);

    const candidate = response.candidates?.[0];
    const resultImages: string[] = [];
    
    if (candidate?.content?.parts) {
      console.log(`📋 Response contains ${candidate.content.parts.length} parts`);
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const base64Image = `data:image/png;base64,${part.inlineData.data}`;
          const resizedImage = await resizeBase64Image(base64Image, targetWidth);
          resultImages.push(resizedImage);
          console.log(`  ✓ Extracted and resized image ${resultImages.length} to ${targetWidth}x${targetWidth}`);
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
      return generateAllProductAngles(referenceFiles, productName, productDescription, angles, model, targetWidth, key, retryCount + 1);
    }
    throw err;
  }
};

/**
 * Resize base64 image to exact dimensions (800x800)
 * Ensures all generated images are exactly the required size
 */
const resizeBase64Image = async (base64Image: string, targetSize: number = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return reject(new Error("Failed to get canvas context"));
      
      // Use high quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw image to exact square dimensions
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = base64Image;
  });
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
