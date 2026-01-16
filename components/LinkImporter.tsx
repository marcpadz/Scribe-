import React, { useState } from 'react';
import { Link2, ArrowRight, Loader2, Youtube, Instagram, Facebook, Twitter, Share2 } from 'lucide-react';
import { NeoButton, NeoCard } from './NeoUi';

interface LinkImporterProps {
  onImport: (url: string) => void;
  isProcessing: boolean;
}

export const LinkImporter: React.FC<LinkImporterProps> = ({ onImport, isProcessing }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onImport(url.trim());
    }
  };

  const getPlatformIcon = (link: string) => {
    const lowUrl = link.toLowerCase();
    if (lowUrl.includes('youtube.com') || lowUrl.includes('youtu.be')) return <Youtube size={18} className="text-red-600" />;
    if (lowUrl.includes('instagram.com')) return <Instagram size={18} className="text-pink-600" />;
    if (lowUrl.includes('facebook.com')) return <Facebook size={18} className="text-blue-700 dark:text-blue-400" />;
    if (lowUrl.includes('x.com') || lowUrl.includes('twitter.com')) return <Twitter size={18} className="text-black dark:text-white" />;
    if (lowUrl.includes('threads.net')) return <Share2 size={18} className="text-black dark:text-white" />;
    return <Link2 size={18} className="text-black dark:text-white" />;
  };

  return (
    <NeoCard className="w-full max-w-lg mt-6 bg-white dark:bg-neo-dark-card border-4">
      <div className="flex items-center gap-2 mb-4 border-b-2 border-black dark:border-white pb-2">
        <div className="bg-neo-blue p-1 border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white">
            <Link2 size={20} className="text-white" />
        </div>
        <h3 className="text-xl font-black uppercase text-black dark:text-white">Import via Link</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors">
            {url ? getPlatformIcon(url) : <Link2 size={18} />}
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube, FB, IG, X, or direct media link..."
            disabled={isProcessing}
            className="w-full pl-10 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border-2 border-black dark:border-white font-bold focus:outline-none focus:bg-white dark:focus:bg-zinc-700 focus:ring-4 focus:ring-neo-yellow/30 placeholder:text-gray-400 text-black dark:text-white transition-all"
            required
          />
        </div>

        <NeoButton 
          type="submit" 
          variant="primary" 
          disabled={isProcessing || !url}
          className="w-full flex items-center justify-center gap-3 py-4"
        >
          {isProcessing ? (
            <>
              <Loader2 className="animate-spin" />
              <span>Fetching Content...</span>
            </>
          ) : (
            <>
              <span>Transcribe from URL</span>
              <ArrowRight size={20} />
            </>
          )}
        </NeoButton>

        <div className="flex flex-wrap gap-2 justify-center opacity-40 text-black dark:text-white">
            <Youtube size={14} />
            <Instagram size={14} />
            <Facebook size={14} />
            <Twitter size={14} />
            <Share2 size={14} />
        </div>

        <p className="text-[10px] text-center font-mono text-gray-500 dark:text-gray-400 uppercase leading-tight">
          Note: This feature attempts to fetch the audio track directly. <br/>
          Direct video hosting links (.mp4, .m4a) work best.
        </p>
      </form>
    </NeoCard>
  );
};