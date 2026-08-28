import React, { useState } from 'react';
import { Link2, ArrowRight, Loader2, Youtube, Instagram, Facebook, Twitter, Share2, AlertCircle, Check } from 'lucide-react';
import { NeoButton, NeoCard } from './NeoUi';

interface LinkImporterProps {
  onImport: (url: string) => void;
  isProcessing: boolean;
  error?: string | null;
}

export const LinkImporter: React.FC<LinkImporterProps> = ({ onImport, isProcessing, error }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onImport(url.trim());
    }
  };

  const getPlatformInfo = (link: string): { icon: React.ReactNode; name: string } => {
    const lowUrl = link.toLowerCase();
    if (lowUrl.includes('youtube.com') || lowUrl.includes('youtu.be')) {
      return { icon: <Youtube size={18} className="text-red-600" />, name: 'YouTube' };
    }
    if (lowUrl.includes('instagram.com')) {
      return { icon: <Instagram size={18} className="text-pink-600" />, name: 'Instagram' };
    }
    if (lowUrl.includes('facebook.com') || lowUrl.includes('fb.com') || lowUrl.includes('fb.watch')) {
      return { icon: <Facebook size={18} className="text-blue-700 dark:text-blue-400" />, name: 'Facebook' };
    }
    if (lowUrl.includes('x.com') || lowUrl.includes('twitter.com')) {
      return { icon: <Twitter size={18} className="text-black dark:text-white" />, name: 'Twitter/X' };
    }
    if (lowUrl.includes('threads.net')) {
      return { icon: <Share2 size={18} className="text-black dark:text-white" />, name: 'Threads' };
    }
    if (lowUrl.includes('tiktok.com')) {
      return { icon: <Share2 size={18} className="text-black dark:text-white" />, name: 'TikTok' };
    }
    if (lowUrl.includes('reddit.com') || lowUrl.includes('redd.it')) {
      return { icon: <Share2 size={18} className="text-orange-600" />, name: 'Reddit' };
    }
    return { icon: <Link2 size={18} className="text-black dark:text-white" />, name: 'Direct Link' };
  };

  const platformInfo = url ? getPlatformInfo(url) : null;

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
            {platformInfo ? platformInfo.icon : <Link2 size={18} />}
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube, TikTok, IG, FB, X, or direct media link..."
            disabled={isProcessing}
            className="w-full pl-10 pr-4 py-4 bg-gray-50 dark:bg-zinc-800 border-2 border-black dark:border-white font-bold focus:outline-none focus:bg-white dark:focus:bg-zinc-700 focus:ring-4 focus:ring-neo-yellow/30 placeholder:text-gray-400 text-black dark:text-white transition-all"
            required
          />
        </div>

        {/* Platform indicator */}
        {platformInfo && platformInfo.name !== 'Direct Link' && (
          <div className="flex items-center gap-2 text-xs font-mono text-gray-500 dark:text-gray-400">
            {platformInfo.icon}
            <span>Detected: <span className="font-bold text-black dark:text-white">{platformInfo.name}</span></span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 text-red-700 dark:text-red-400 text-sm font-bold">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

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
          Supported: YouTube, TikTok, Instagram, Facebook, Twitter/X, Reddit, Twitch, Vimeo <br/>
          and direct links to media files (.mp4, .mp3, .wav, etc.)
        </p>
      </form>
    </NeoCard>
  );
};