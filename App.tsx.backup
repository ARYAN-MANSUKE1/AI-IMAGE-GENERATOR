
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FolderOpen, Play, RotateCcw, Image as ImageIcon, Sparkles, X, Key, Settings2, ExternalLink, Maximize2, Layers, AlertCircle, UploadCloud, Info, Download, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ProcessingItem, BatchConfig, AppStatus } from './types';
import { transformImage, resizeImageLocally } from './services/gemini';
import ImageCard from './components/ImageCard';
import JSZip from 'jszip';

const App: React.FC = () => {
  const [items, setItems] = useState<ProcessingItem[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; type: 'info' | 'warning' | 'error' | 'security' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [config, setConfig] = useState<BatchConfig>({
    mode: 'ai',
    prompt: "High-quality professional studio photograph, same product and style as reference image, soft natural lighting, clean minimal background, sharp focus, realistic fabric texture, commercial product photography, 4k quality no major change (no change just make it better) dimensions 800px * 800px and bleed 30px into 30px",
    targetWidth: 800,
    aspectRatio: "1:1",
    model: 'gemini-2.5-flash-image',
    concurrency: 3
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, [config.model]);

  const handleOpenKeySelection = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const processEntries = async (entries: any[], rootHandle: any = null) => {
    setStatus('scanning');
    setError(null);
    const discoveredItems: ProcessingItem[] = [];

    async function scanDirectory(handle: any, path: string = "") {
      try {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            if (file.type.startsWith('image/')) {
              discoveredItems.push({
                id: Math.random().toString(36).substring(7),
                file,
                handle: entry,
                parentHandle: handle,
                relativePath: path || "./",
                status: 'pending',
                originalUrl: URL.createObjectURL(file),
                progress: 0
              });
            }
          } else if (entry.kind === 'directory') {
            await scanDirectory(entry, `${path}${entry.name}/`);
          }
        }
      } catch (e: any) {
        console.error("Error scanning subdirectory:", e);
      }
    }

    if (rootHandle) {
      await scanDirectory(rootHandle);
    }
    
    setItems(discoveredItems);
    setStatus(discoveredItems.length > 0 ? 'ready' : 'idle');
    if (discoveredItems.length === 0) {
      setError({ message: "No images found in the selected folder.", type: 'warning' });
    } else if (rootHandle) {
      setError({ message: "Folder access granted. Images will be saved directly back to your local folder.", type: 'info' });
    }
  };

  const handleFileFallback = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | null } }) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setStatus('scanning');
    setError(null);
    
    const discoveredItems: ProcessingItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const fullPath = (file as any).webkitRelativePath || "";
        const pathParts = fullPath.split('/');
        pathParts.pop();
        const relativePath = pathParts.join('/') + (pathParts.length > 0 ? '/' : '');

        discoveredItems.push({
          id: Math.random().toString(36).substring(7),
          file,
          handle: {} as any,
          parentHandle: {} as any,
          relativePath: relativePath || "./",
          status: 'pending',
          originalUrl: URL.createObjectURL(file),
          progress: 0
        });
      }
    }
    
    setItems(discoveredItems);
    setStatus(discoveredItems.length > 0 ? 'ready' : 'idle');
    setDirectoryHandle(null);
    
    if (discoveredItems.length === 0) {
      setError({ message: "No images found in the uploaded selection.", type: 'warning' });
    } else {
      setError({ 
        message: "Folder uploaded. Due to security restrictions, results will be provided as a ZIP that preserves your original folder structure.", 
        type: 'info' 
      });
    }
  };

  const selectFolder = async () => {
    setError(null);
    
    // Attempt modern Directory Picker first
    if ((window as any).showDirectoryPicker) {
      try {
        const rootHandle = await (window as any).showDirectoryPicker({
          mode: 'readwrite'
        });
        setDirectoryHandle(rootHandle);
        await processEntries([], rootHandle);
        return;
      } catch (err: any) {
        console.warn("Directory Picker failed or was blocked:", err);
        if (err.name === 'AbortError') return;
        // If security error (common in iframes), move to fallback
      }
    }

    // Fallback to standard upload
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileFallback({ target: { files } });
    }
  };

  const startBatch = async () => {
    if (config.mode === 'ai' && config.model === 'gemini-3-pro-image-preview' && !hasApiKey) {
      await handleOpenKeySelection();
    }

    if (status !== 'ready' && status !== 'done') return;
    setStatus('processing');

    const pendingItems = items.filter(i => i.status !== 'completed');
    let currentIndex = 0;

    const processNext = async () => {
      if (currentIndex >= pendingItems.length || status === 'idle') return;
      const item = pendingItems[currentIndex++];
      
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        let resultDataUrl = "";
        
        if (config.mode === 'ai') {
          resultDataUrl = await transformImage(item.file, config.prompt, config.model);
        } else {
          resultDataUrl = await resizeImageLocally(item.file, config.targetWidth);
        }
        
        // If we have direct directory access, save it back immediately
        if (directoryHandle && item.parentHandle && item.parentHandle.getFileHandle) {
          try {
            const fileName = `${item.file.name.split('.')[0]}_studio.png`;
            const fileHandle = await item.parentHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(resultDataUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();
          } catch (saveErr) {
            console.error("Failed to save file directly:", saveErr);
          }
        }

        setItems(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'completed', 
          resultUrl: resultDataUrl,
          progress: 100 
        } : i));
      } catch (err: any) {
        if (err.message?.includes("Requested entity was not found.")) setHasApiKey(false);
        setItems(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'error', 
          error: err.message || 'Operation failed' 
        } : i));
      }

      await processNext();
    };

    const workerCount = config.mode === 'resize' ? Math.min(8, pendingItems.length) : config.concurrency;
    const workers = Array(workerCount).fill(null).map(() => processNext());

    await Promise.all(workers);
    setStatus('done');
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    const completedItems = items.filter(i => i.status === 'completed' && i.resultUrl);
    
    if (completedItems.length === 0) return;

    for (const item of completedItems) {
      const response = await fetch(item.resultUrl!);
      const blob = await response.blob();
      const fileName = `${item.file.name.split('.')[0]}_studio.png`;
      const pathInZip = item.relativePath === './' ? fileName : `${item.relativePath}${fileName}`;
      zip.file(pathInZip, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `studio_batch_${Date.now()}.zip`;
    link.click();
  };

  const reset = () => {
    items.forEach(item => URL.revokeObjectURL(item.originalUrl));
    setItems([]);
    setDirectoryHandle(null);
    setStatus('idle');
    setError(null);
  };

  const completedCount = items.filter(i => i.status === 'completed').length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div 
      className={`min-h-screen flex flex-col bg-slate-950 text-slate-200 transition-colors duration-300 ${isDragging ? 'bg-indigo-950/20' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileFallback} 
        // @ts-ignore
        webkitdirectory="true" 
        multiple 
      />

      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Bulk Studio</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">800x800 Professional Flow</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {items.length > 0 && (
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-[10px] font-bold text-slate-500 mb-1">PROGRESS: {progressPercent}%</span>
              <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          
          {items.length === 0 ? (
            <button onClick={selectFolder} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/40">
              <FolderOpen className="w-4 h-4" /> Pick Folder
            </button>
          ) : (
            <div className="flex items-center gap-2">
               <button onClick={reset} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all">
                <X className="w-4 h-4" /> Clear
              </button>
              
              {status === 'done' && completedCount > 0 && (
                <button onClick={downloadAllAsZip} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all animate-bounce">
                  <Download className="w-4 h-4" /> {directoryHandle ? 'Download Backup ZIP' : 'Download Folders (ZIP)'}
                </button>
              )}

              <button onClick={startBatch} disabled={status === 'processing'} className={`${status === 'processing' ? 'bg-slate-700 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'} text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg`}>
                {status === 'processing' ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                {status === 'processing' ? 'Processing...' : 'Start Production'}
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className={`border-b px-6 py-3 flex items-center gap-3 text-xs font-medium ${
          error.type === 'info' ? 'bg-indigo-900/30 border-indigo-800/50 text-indigo-200' :
          error.type === 'error' ? 'bg-red-900/20 border-red-800/50 text-red-200' :
          'bg-amber-900/20 border-amber-800/50 text-amber-200'
        }`}>
          {error.type === 'info' ? <Info className="w-4 h-4 text-indigo-400 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <div className="flex flex-col">
            <span className="font-bold uppercase tracking-wider text-[10px] opacity-80 mb-0.5">{error.type}</span>
            <span>{error.message}</span>
          </div>
          <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-slate-900 border-r border-slate-800 p-6 overflow-y-auto hidden lg:block custom-scrollbar">
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="w-4 h-4 text-indigo-400" />
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Studio Config</h2>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Output Dimensions</label>
                <div className="grid grid-cols-2 gap-2">
                   <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono">
                     {config.targetWidth}px Width
                   </div>
                   <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono">
                     {config.targetWidth}px Height
                   </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">AI Model</label>
                <select 
                  value={config.model}
                  onChange={(e) => setConfig({...config, model: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                  <option value="gemini-3-pro-image-preview">Gemini 3 Pro (Studio Grade)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Style Prompt</label>
                <textarea 
                  value={config.prompt}
                  onChange={(e) => setConfig({...config, prompt: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-medium leading-relaxed"
                />
              </div>
            </section>

            <section className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-3 h-3" /> Target Folders
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Method</span>
                  <span className={`${directoryHandle ? 'text-emerald-400' : 'text-indigo-400'} font-bold uppercase`}>
                    {directoryHandle ? 'Direct Save-Back' : 'Folder-ZIP Flow'}
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-700/50">
                  <span className="text-slate-500">Queue Total</span>
                  <span className="text-white font-bold">{items.length} items</span>
                </div>
              </div>
            </section>
          </div>
        </aside>

        <section className={`flex-1 overflow-y-auto bg-slate-950 p-6 custom-scrollbar relative`}>
          {isDragging && (
            <div className="absolute inset-0 z-10 bg-indigo-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none border-4 border-dashed border-indigo-500 m-4 rounded-2xl">
              <div className="flex flex-col items-center gap-4 bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800">
                <UploadCloud className="w-16 h-16 text-indigo-400 animate-bounce" />
                <h3 className="text-xl font-bold">Drop Your Product Folder</h3>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 border border-slate-800 shadow-xl">
                <FolderOpen className="w-8 h-8 text-indigo-500" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-slate-100">Professional Product Studio</h2>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                Transform entire folders into high-quality studio shots. We'll generate 800x800 images with 30px bleed and maintain your folder hierarchy.
              </p>
              
              <div className="flex flex-col gap-3 w-full">
                <button onClick={selectFolder} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-indigo-900/20 w-full group">
                  <FolderOpen className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                  Choose Product Folder
                </button>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">supports recursive subfolders</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Production Queue ({items.length})
                </h2>
                {status === 'done' && (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase">
                    <CheckCircle2 className="w-4 h-4" /> Ready for Collection
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {items.map(item => <ImageCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-2 flex items-center justify-between text-[10px] text-slate-500 font-bold tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'processing' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="uppercase">{status}</span>
          </div>
          <span className="hidden sm:inline">OUTPUT: 800x800 + 30PX BLEED</span>
        </div>
        <div className="flex gap-6 uppercase items-center">
          <span className="hidden sm:inline">Recursive Search: ACTIVE</span>
          <span className={`px-2 py-0.5 rounded ${directoryHandle ? 'bg-emerald-900/20 text-emerald-500' : 'bg-indigo-900/20 text-indigo-400'}`}>
            {directoryHandle ? 'MODE: DIRECT DISK WRITE' : 'MODE: ZIP FOLDER RECONSTRUCTION'}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
