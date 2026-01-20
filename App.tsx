
import React, { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { CHANNELS, DEFAULT_BRIEFING } from './constants';
import { AdChannel, AdVariant, Briefing, Placement } from './types';
import { fileToBase64, downloadImage } from './utils/imageUtils';
import { generateAdVariant } from './services/geminiService';

export default function App() {
  const [selectedChannel, setSelectedChannel] = useState<AdChannel>(CHANNELS[0]);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [baseImagePreview, setBaseImagePreview] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<Briefing>(DEFAULT_BRIEFING);
  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const b64 = await fileToBase64(file);
      setBaseImage(b64);
      setBaseImagePreview(URL.createObjectURL(file));
      setVariants([]); // Reset results if new image is uploaded
    }
  };

  const handleGenerate = async () => {
    if (!baseImage) return;

    setIsGenerating(true);
    const newVariants: AdVariant[] = selectedChannel.placements.map(p => ({
      id: Math.random().toString(36).substr(2, 9),
      placementId: p.id,
      placementName: p.name,
      imageUrl: '',
      aspectRatio: p.aspectRatio,
      status: 'pending'
    }));
    
    setVariants(newVariants);

    for (let i = 0; i < newVariants.length; i++) {
      const currentPlacement = selectedChannel.placements[i];
      
      setVariants(prev => prev.map((v, idx) => 
        idx === i ? { ...v, status: 'generating' } : v
      ));

      try {
        const imageUrl = await generateAdVariant(baseImage, currentPlacement, briefing);
        setVariants(prev => prev.map((v, idx) => 
          idx === i ? { ...v, imageUrl, status: 'completed' } : v
        ));
      } catch (err: any) {
        setVariants(prev => prev.map((v, idx) => 
          idx === i ? { ...v, status: 'error', error: err.message } : v
        ));
      }
    }
    
    setIsGenerating(false);
  };

  const downloadAll = () => {
    variants.forEach(v => {
      if (v.imageUrl) {
        downloadImage(v.imageUrl, `${selectedChannel.id}_${v.placementName.toLowerCase().replace(' ', '_')}.png`);
      }
    });
  };

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-indigo-400">01</span> Upload Asset
            </h2>
            <div className="relative group">
              <div className={`
                border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer
                ${baseImagePreview ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
              `}>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleFileUpload}
                />
                {baseImagePreview ? (
                  <img 
                    src={baseImagePreview} 
                    alt="Preview" 
                    className="w-full h-48 object-contain rounded-lg"
                  />
                ) : (
                  <>
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <p className="text-sm text-white/60 text-center">Click or drag product image</p>
                  </>
                )}
              </div>
              {baseImagePreview && (
                <button 
                  onClick={() => {setBaseImage(null); setBaseImagePreview(null);}}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </section>

          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-indigo-400">02</span> Select Channel
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {CHANNELS.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel)}
                  className={`
                    p-3 rounded-xl border flex flex-col items-center gap-2 transition-all text-sm
                    ${selectedChannel.id === channel.id 
                      ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                      : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white'}
                  `}
                >
                  <span className="text-2xl">{channel.icon}</span>
                  {channel.name}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-indigo-400">03</span> Briefing (Optional)
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-white/40 block mb-1.5">Style / Look & Feel</label>
                <input 
                  type="text" 
                  value={briefing.style}
                  onChange={(e) => setBriefing({...briefing, style: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-white/40 block mb-1.5">CTA Text</label>
                <input 
                  type="text" 
                  value={briefing.cta}
                  onChange={(e) => setBriefing({...briefing, cta: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                disabled={!baseImage || isGenerating}
                onClick={handleGenerate}
                className={`
                  w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                  ${!baseImage || isGenerating 
                    ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}
                `}
              >
                {isGenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Generating Set...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate {selectedChannel.placements.length} Ads
                  </>
                )}
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Creative Preview</h2>
            {variants.some(v => v.status === 'completed') && (
              <button 
                onClick={downloadAll}
                className="text-sm flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All (.ZIP)
              </button>
            )}
          </div>

          {!baseImage && !isGenerating && variants.length === 0 && (
            <div className="aspect-[16/9] w-full border border-white/5 bg-white/[0.02] rounded-3xl flex flex-col items-center justify-center text-white/20">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">Ready for your assets</p>
              <p className="text-sm">Upload an image and select a channel to start generating.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {variants.map(variant => (
              <div 
                key={variant.id} 
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden group hover:border-indigo-500/50 transition-all flex flex-col"
              >
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                  <div>
                    <h3 className="font-semibold text-sm">{variant.placementName}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-white/40">{variant.aspectRatio} Ratio</p>
                  </div>
                  {variant.status === 'completed' && (
                    <button 
                      onClick={() => downloadImage(variant.imageUrl, `${variant.placementId}.png`)}
                      className="p-2 bg-white/5 rounded-lg hover:bg-indigo-500 hover:text-white transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className={`relative flex items-center justify-center bg-black transition-all ${
                  variant.aspectRatio === '9:16' ? 'aspect-[9/16] max-h-[500px]' : 
                  variant.aspectRatio === '1:1' ? 'aspect-square' : 
                  'aspect-[16/9]'
                }`}>
                  {variant.status === 'generating' && (
                    <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                      <p className="text-sm font-medium">Gemini is re-imagining...</p>
                      <p className="text-xs text-white/40 mt-1 italic">Smart outpainting & scaling active</p>
                    </div>
                  )}

                  {variant.status === 'completed' ? (
                    <img 
                      src={variant.imageUrl} 
                      alt={variant.placementName}
                      className="w-full h-full object-contain"
                    />
                  ) : variant.status === 'error' ? (
                    <div className="p-8 text-center">
                      <p className="text-red-400 text-sm font-medium">Generation Failed</p>
                      <p className="text-xs text-white/40 mt-2">{variant.error || "Check your API key or connection."}</p>
                    </div>
                  ) : variant.status === 'pending' ? (
                    <div className="text-white/10 flex flex-col items-center">
                      <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs">Waiting in queue...</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
