  import React, { useState, useEffect } from 'react';
import { FolderOpen, Play, ChevronLeft, ChevronRight, Settings2, AlertCircle, Info, CheckCircle2, Download, Plus, Minus, X } from 'lucide-react';
import { ImageFile, Product, AngleConfig, ModelName } from './types';
import { generateProductAngle } from './services/gemini';
import ImageCard from './components/ImageCard';
import JSZip from 'jszip';

const DEFAULT_ANGLES: AngleConfig[] = [
  { name: 'Front', prompt: 'Front view of the product', enabled: true },
  { name: 'Back', prompt: 'Back view of the product', enabled: true },
  { name: 'Side', prompt: 'Side view of the product', enabled: true },
];

type AppStatus = 'idle' | 'processing' | 'completed' | 'error';

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string>('');
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // Configuration state
  const [productDescription, setProductDescription] = useState<string>('High-quality professional product');
  const [angles, setAngles] = useState<AngleConfig[]>(DEFAULT_ANGLES);
  const [customAngle, setCustomAngle] = useState<string>('');
  const [modelName, setModelName] = useState<ModelName>('gemini-2.5-flash-image');
  const [targetWidth] = useState<number>(800); // Fixed to 800px
  const [batchSize, setBatchSize] = useState<number>(1); // New batch size state

  // Progress tracking
  const [totalAnglesProcessed, setTotalAnglesProcessed] = useState(0);
  const [totalAnglesToProcess, setTotalAnglesToProcess] = useState(0);
  const [apiRequestCount, setApiRequestCount] = useState(0);
  const [currentApiStatus, setCurrentApiStatus] = useState<string>('');
  const [activityLog, setActivityLog] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>>([]);
  const [requestStartTime, setRequestStartTime] = useState<number>(0);

  const currentProduct = products[currentProductIndex];

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setActivityLog(prev => [...prev.slice(-10), { time, message, type }]); // Keep last 11 entries
  };

  const handleSelectFolder = async () => {
    try {
      // @ts-ignore - File System Access API
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setStatus('processing');
      setError('Scanning folders...');
      
      const productsList: Product[] = [];
      let scannedFolders = 0;
      
      // @ts-ignore
      for await (const productEntry of handle.values()) {
        if (productEntry.kind !== 'directory') continue;
        
        const productName = productEntry.name;
        scannedFolders++;
        setError(`Scanning folders... (${scannedFolders} folders found)`);
        
        // Check if this product folder has color subfolders
        const colorFolders: Map<string, ImageFile[]> = new Map();
        let hasColorSubfolders = false;
        
        // @ts-ignore
        for await (const entry of productEntry.values()) {
          if (entry.kind === 'directory') {
            // This is a color subfolder
            hasColorSubfolders = true;
            const colorName = entry.name;
            const images: ImageFile[] = [];
            
            // Get all images from this color folder
            // @ts-ignore
            for await (const fileEntry of entry.values()) {
              if (fileEntry.kind === 'file') {
                const file = await fileEntry.getFile();
                if (file.type.startsWith('image/')) {
                  images.push({
                    file,
                    preview: URL.createObjectURL(file),
                    status: 'pending',
                    name: file.name,
                    path: `${productName}/${colorName}/${file.name}`,
                  });
                }
              }
            }
            
            if (images.length > 0) {
              colorFolders.set(colorName, images);
            }
          }
        }
        
        // If color subfolders exist, create separate products for each color
        if (hasColorSubfolders && colorFolders.size > 0) {
          for (const [colorName, images] of colorFolders.entries()) {
            productsList.push({
              name: `${productName} - ${colorName}`,
              images,
              generatedImages: [],
            });
          }
        } else {
          // No color subfolders, load all images from product folder directly
          const images: ImageFile[] = [];
          
          // @ts-ignore
          for await (const entry of productEntry.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              if (file.type.startsWith('image/')) {
                images.push({
                  file,
                  preview: URL.createObjectURL(file),
                  status: 'pending',
                  name: file.name,
                  path: `${productName}/${file.name}`,
                });
              }
            }
          }
          
          if (images.length > 0) {
            productsList.push({
              name: productName,
              images,
              generatedImages: [],
            });
          }
        }
      }
      
      setProducts(productsList);
      setCurrentProductIndex(0);
      setStatus('idle');
      setError('');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(`Failed to select folder: ${err.message}`);
        setStatus('error');
      } else {
        setStatus('idle');
        setError('');
      }
    }
  };

  const handleAddCustomAngle = () => {
    if (customAngle.trim()) {
      setAngles([
        ...angles,
        { name: customAngle, prompt: `${customAngle} view of the product`, enabled: true }
      ]);
      setCustomAngle('');
    }
  };

  const handleRemoveAngle = (index: number) => {
    setAngles(angles.filter((_, i) => i !== index));
  };

  const handleToggleAngle = (index: number) => {
    setAngles(angles.map((angle, i) => 
      i === index ? { ...angle, enabled: !angle.enabled } : angle
    ));
  };

  const handleGenerateBatch = async () => {
    if (products.length === 0) return;

    setStatus('processing');
    setError('');
    
    const enabledAngles = angles.filter(a => a.enabled);
    
    // Calculate batch range
    const startIndex = currentProductIndex;
    const endIndex = Math.min(startIndex + batchSize, products.length);
    const productsToProcess = products.slice(startIndex, endIndex);
    
    const totalAngles = productsToProcess.length * enabledAngles.length;
    setTotalAnglesToProcess(totalAngles);
    setTotalAnglesProcessed(0);
    setApiRequestCount(0);
    setActivityLog([]);
    addLog('🚀 Starting generation process...', 'info');
    
    const updatedProducts = [...products];

    for (let i = 0; i < productsToProcess.length; i++) {
      const productIndex = startIndex + i;
      const product = productsToProcess[i];
      const generatedImages: ImageFile[] = [];

      const referenceFiles = product.images.map(img => img.file);
      
      addLog(`📦 Processing product: "${product.name}"`, 'info');
      
      // Generate each angle separately (3 separate API calls)
      for (const angle of enabledAngles) {
        try {
          const requestNum = apiRequestCount + 1;
          setCurrentApiStatus(`Generating ${angle.name} for ${product.name}...`);
          addLog(`🚀 API REQUEST #${requestNum}: ${angle.name} angle`, 'info');
          console.log(`🚀 API REQUEST #${requestNum}: Generating ${angle.name} for "${product.name}"`);
          
          setRequestStartTime(Date.now());
          
          const blobUrl = await generateProductAngle(
            referenceFiles,
            product.name,
            productDescription || 'A high-quality product',
            angle.prompt,
            modelName,
            targetWidth
          );
          
          const duration = ((Date.now() - requestStartTime) / 1000).toFixed(2);
          setApiRequestCount(prev => prev + 1);
          console.log(`✅ API REQUEST COMPLETED: ${angle.name} in ${duration}s`);
          addLog(`✅ ${angle.name} completed in ${duration}s`, 'success');

          // Fetch blob and create File
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          const generatedFile = new File([blob], `${angle.name}.png`, { type: 'image/png' });

          generatedImages.push({
            file: generatedFile,
            preview: blobUrl,
            status: 'completed',
            name: `${angle.name}.png`,
            path: `${product.name}/${angle.name}.png`,
            angle: angle.name,
          });

          setTotalAnglesProcessed(prev => prev + 1);
        } catch (err: any) {
          console.error(`❌ Failed to generate ${angle.name}:`, err);
          setApiRequestCount(prev => prev + 1);
          addLog(`❌ ${angle.name} failed: ${err.message}`, 'error');
          
          generatedImages.push({
            file: new File([], `${angle.name}.png`),
            preview: '',
            status: 'failed',
            name: `${angle.name}.png`,
            path: `${product.name}/${angle.name}.png`,
            angle: angle.name,
          });

          setTotalAnglesProcessed(prev => prev + 1);
        }
      }

      updatedProducts[productIndex].generatedImages = generatedImages;
      setProducts([...updatedProducts]);
    }

    const totalRequests = apiRequestCount + productsToProcess.length;
    console.log(`📈 TOTAL API REQUESTS SENT: ${totalRequests}`);
    addLog(`📈 Total API requests: ${totalRequests}`, 'success');
    addLog(`🎉 All products completed!`, 'success');
    setCurrentApiStatus('Completed');
    setStatus('completed');
  };

  const handleGenerateAll = async () => {
    if (products.length === 0) return;

    setStatus('processing');
    setError('');
    
    const enabledAngles = angles.filter(a => a.enabled);
    const totalAngles = products.length * enabledAngles.length;
    setTotalAnglesToProcess(totalAngles);
    setTotalAnglesProcessed(0);
    
    const updatedProducts = [...products];

    for (let productIndex = 0; productIndex < updatedProducts.length; productIndex++) {
      const product = updatedProducts[productIndex];
      const generatedImages: ImageFile[] = [];

      for (const angle of enabledAngles) {
        try {
          const referenceFiles = product.images.map(img => img.file);
          
          const blobUrl = await generateProductAngle(
            referenceFiles,
            product.name,
            productDescription || 'A high-quality product',
            angle.prompt,
            modelName,
            targetWidth
          );

          // Fetch blob and create File
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          const generatedFile = new File([blob], `${angle.name}.png`, { type: 'image/png' });

          generatedImages.push({
            file: generatedFile,
            preview: blobUrl,
            status: 'completed',
            name: `${angle.name}.png`,
            path: `${product.name}/${angle.name}.png`,
            angle: angle.name,
          });

          setTotalAnglesProcessed(prev => prev + 1);
        } catch (err: any) {
          console.error(`Failed to generate ${angle.name} for ${product.name}:`, err);
          
          generatedImages.push({
            file: new File([], `${angle.name}.png`),
            preview: '',
            status: 'failed',
            name: `${angle.name}.png`,
            path: `${product.name}/${angle.name}.png`,
            angle: angle.name,
          });

          setTotalAnglesProcessed(prev => prev + 1);
        }
      }

      updatedProducts[productIndex].generatedImages = generatedImages;
      setProducts([...updatedProducts]);
    }

    setStatus('completed');
  };

  const handleDownloadProduct = async (product: Product) => {
    if (!product.generatedImages || product.generatedImages.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder(product.name);

    for (const img of product.generatedImages) {
      if (img.status === 'completed') {
        folder?.file(img.name, img.file);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${product.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();

    for (const product of products) {
      if (product.generatedImages && product.generatedImages.length > 0) {
        const folder = zip.folder(product.name);
        
        for (const img of product.generatedImages) {
          if (img.status === 'completed') {
            folder?.file(img.name, img.file);
          }
        }
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-products.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const goToNextProduct = () => {
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex(currentProductIndex + 1);
    }
  };

  const goToPreviousProduct = () => {
    if (currentProductIndex > 0) {
      setCurrentProductIndex(currentProductIndex - 1);
    }
  };

  const getRemainingProducts = () => {
    return Math.min(batchSize, products.length - currentProductIndex);
  };

  const overallProgress = totalAnglesToProcess > 0 
    ? (totalAnglesProcessed / totalAnglesToProcess) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Fixed Header */}
      <header className="bg-gray-900 border-b border-gray-800 shadow-sm fixed top-0 left-0 right-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white">Multi-Angle Product Studio</h1>
              {products.length > 0 && (
                <span className="text-sm text-gray-400">
                  {products.length} product{products.length !== 1 ? 's' : ''} loaded
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {products.length === 0 ? (
                <button
                  onClick={handleSelectFolder}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <FolderOpen className="w-5 h-5" />
                  Select Products Folder
                </button>
              ) : (
                <>
                  <button
                    onClick={handleGenerateBatch}
                    disabled={status === 'processing' || angles.filter(a => a.enabled).length === 0}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-5 h-5" />
                    {status === 'processing' ? 'Generating...' : `Generate Batch (${getRemainingProducts()})`}
                  </button>

                  <button
                    onClick={handleGenerateAll}
                    disabled={status === 'processing' || angles.filter(a => a.enabled).length === 0}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-5 h-5" />
                    Generate All
                  </button>
                  
                  {status === 'completed' && (
                    <button
                      onClick={handleDownloadAll}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      Download All
                    </button>
                  )}
                  
                  <button
                    onClick={handleSelectFolder}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors"
                  >
                    <FolderOpen className="w-5 h-5" />
                    Change Folder
                  </button>
                </>
              )}
            </div>
          </div>
          
          {status === 'processing' && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">
                  Overall Progress: {totalAnglesProcessed} / {totalAnglesToProcess} angles
                </span>
                <span className="text-sm font-medium text-white">
                  {Math.round(overallProgress)}%
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              
              {/* API Status Card */}
              <div className="mb-3 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-semibold text-blue-300">API Requests Sent:</span>
                    <span className="text-2xl font-bold text-blue-400">{apiRequestCount}</span>
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  {currentApiStatus}
                </div>
              </div>

              {/* Activity Log */}
              <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                <div className="px-3 py-2 bg-gray-800/80 border-b border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300">Activity Log</h3>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {activityLog.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">No activity yet...</div>
                  ) : (
                    <div className="divide-y divide-gray-800">
                      {activityLog.map((log, index) => (
                        <div 
                          key={index} 
                          className={`px-3 py-2 text-xs font-mono ${
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            'text-gray-400'
                          }`}
                        >
                          <span className="text-gray-500">[{log.time}]</span> {log.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 pt-24">
        {/* Left Sidebar - Configuration */}
        {products.length > 0 && (
          <aside className="w-80 bg-gray-900 border-r border-gray-800 p-6 fixed left-0 top-24 bottom-0 overflow-y-auto">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Settings2 className="w-5 h-5" />
                  Studio Configuration
                </h2>
              </div>

              {/* Batch Size */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Batch Size (Products per Generation)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBatchSize(Math.max(1, batchSize - 1))}
                    className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={products.length}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Math.max(1, Math.min(products.length, parseInt(e.target.value) || 1)))}
                    className="flex-1 px-3 py-2 text-center bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => setBatchSize(Math.min(products.length, batchSize + 1))}
                    className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Will generate {getRemainingProducts()} product{getRemainingProducts() !== 1 ? 's' : ''} from current position
                </p>
              </div>

              {/* Product Description */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Product Description
                </label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Describe the products..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>

              {/* AI Model */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  AI Model for Image Generation
                </label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value as ModelName)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <optgroup label="Gemini 3 Models (2026 Latest)">
                    <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview) - Complex workflows</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview) - Highest capability</option>
                  </optgroup>
                  <optgroup label="Gemini 2.5 Models">
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Stable) ⭐</option>
                    <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash Image Preview</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro - Deep reasoning</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash - Best balance</option>
                    <option value="gemini-2.5-flash-8b">Gemini 2.5 Flash-8B Lite - Ultra-efficient</option>
                  </optgroup>
                  <optgroup label="Gemini 1.5 Models (Older)">
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro - Reliable</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash - Fast</option>
                  </optgroup>
                  <optgroup label="Imagen Models (Text-to-Image)">
                    <option value="imagen-4.0-generate-fast-001">Imagen 4 Fast - Ultra-fast generation</option>
                    <option value="imagen-4.0-generate-001">Imagen 4 - Best photorealistic</option>
                    <option value="imagen-3.1-generate-001">Imagen 3.1 - High-quality + editing</option>
                    <option value="imagen-3.0-generate-001">Imagen 3 - High-quality</option>
                  </optgroup>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {modelName.startsWith('gemini-3') && '🚀 Latest 2026 model - Optimized for complex workflows'}
                  {modelName === 'gemini-2.5-flash-image' && '⚡ Recommended - Best balance of speed and quality'}
                  {modelName === 'gemini-2.5-flash-image-preview' && '🔬 Preview version with latest features'}
                  {modelName === 'gemini-2.5-pro' && '🧠 High-capability for deep reasoning and complex tasks'}
                  {modelName === 'gemini-2.5-flash' && '⚡ Fast and intelligent processing'}
                  {modelName === 'gemini-2.5-flash-8b' && '💨 Ultra-efficient for massive scale'}
                  {modelName.startsWith('gemini-1.5') && '🔒 Reliable older version'}
                  {modelName.startsWith('imagen-4') && '🎨 Imagen 4 - Photorealistic text-to-image (no reference images)'}
                  {modelName.startsWith('imagen-3') && '🖼️ Imagen 3 - High-quality text-to-image (no reference images)'}
                </p>
              </div>

              {/* Target Width - Fixed */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Image Width: {targetWidth}px (Fixed)
                </label>
                <div className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600 w-full"></div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Locked at 800×800px</p>
              </div>

              {/* Angles Configuration */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Angles to Generate
                </label>
                <div className="space-y-2">
                  {angles.map((angle, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg border border-gray-700">
                      <input
                        type="checkbox"
                        checked={angle.enabled}
                        onChange={() => handleToggleAngle(index)}
                        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                      />
                      <span className="flex-1 text-sm text-gray-200">{angle.name}</span>
                      {index >= 3 && (
                        <button
                          onClick={() => handleRemoveAngle(index)}
                          className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Custom Angle */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={customAngle}
                    onChange={(e) => setCustomAngle(e.target.value)}
                    placeholder="Custom angle..."
                    className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCustomAngle()}
                  />
                  <button
                    onClick={handleAddCustomAngle}
                    disabled={!customAngle.trim()}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="flex gap-2">
                  <Info className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-xs text-gray-300">
                    All reference images for each product will be used together as context to generate each angle view.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className={`flex-1 ${products.length > 0 ? 'ml-80' : ''}`}>
          {products.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FolderOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-300 mb-2">No Products Loaded</h2>
                <p className="text-gray-500 mb-4">Select a folder containing product subfolders to begin</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* Product Navigation */}
              <div className="bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-4 mb-6">
                <div className="flex items-center justify-between">
                  <button
                    onClick={goToPreviousProduct}
                    disabled={currentProductIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Previous
                  </button>
                  
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white">{currentProduct.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                    Color subfolders are treated as separate products
                    </p>
                  </div>
                  
                  <button
                    onClick={goToNextProduct}
                    disabled={currentProductIndex === products.length - 1}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Reference Images */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">Reference Images</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  {currentProduct.images.map((img, index) => (
                    <div key={index} className="bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-4">
                      <img
                        src={img.preview}
                        alt={img.name}
                        className="w-full h-48 object-contain rounded-lg mb-2 bg-gray-800"
                      />
                      <p className="text-sm text-gray-400 text-center truncate">{img.name}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generated Angles */}
              {currentProduct.generatedImages && currentProduct.generatedImages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Generated Angles</h3>
                    <button
                      onClick={() => handleDownloadProduct(currentProduct)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download This Product
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {currentProduct.generatedImages.map((img, index) => (
                      <ImageCard key={index} item={img} />
                    ))}
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mt-6 p-4 bg-red-900/20 border border-red-800 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
