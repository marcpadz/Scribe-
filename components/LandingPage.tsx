import React from 'react';
import { Play, Upload, Brain, Clock, Scissors, MessageSquare, ArrowRight, CheckCircle2 } from 'lucide-react';
import { NeoButton } from './NeoUi';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onSignIn }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-neo-dark text-black dark:text-white transition-colors duration-200">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-neo-yellow border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white text-black font-black text-sm uppercase tracking-wider mb-8">
            <Brain size={16} /> AI-Powered Transcription
          </div>
          <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter mb-6">
            Neo<span className="text-neo-pink">Scriber</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-medium max-w-2xl mx-auto mb-10">
            Transcribe audio & video with AI. Get timed transcripts, chat about your content, and export clips — all in one tool.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <NeoButton variant="primary" onClick={onGetStarted} className="px-8 py-4 text-lg flex items-center gap-2 shadow-neo active:shadow-none active:translate-y-1 transition-all">
              Get Started Free <ArrowRight size={20} />
            </NeoButton>
            <NeoButton variant="secondary" onClick={onSignIn} className="px-8 py-4 text-lg">
              Sign In
            </NeoButton>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: Upload,
              title: 'Upload or Record',
              desc: 'Drop in audio/video files, record directly, or paste a link. We handle WAV, MP3, MP4, and more.',
              color: 'bg-neo-pink',
            },
            {
              icon: Brain,
              title: 'AI Transcription',
              desc: 'Powered by Gemini Flash. Chunked processing handles files of any length with precise timestamps.',
              color: 'bg-neo-blue',
            },
            {
              icon: MessageSquare,
              title: 'Chat About Your Content',
              desc: 'Ask questions about your transcript. Get summaries, highlights, and insights powered by Gemma 4 31B.',
              color: 'bg-neo-green',
            },
            {
              icon: Scissors,
              title: 'Export Clips',
              desc: 'Select transcript segments and export them as WAV clips. Perfect for quotes and highlights.',
              color: 'bg-neo-yellow',
            },
            {
              icon: Clock,
              title: 'Bookmark & Navigate',
              desc: 'Mark key moments in your media. Click any timestamp to jump right to that point.',
              color: 'bg-neo-pink',
            },
            {
              icon: Play,
              title: 'Speed Controls',
              desc: 'Play at 1x, 1.5x, 2x, or 3x. Auto-scroll follows the active transcript segment.',
              color: 'bg-neo-blue',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white bg-white dark:bg-neo-dark-card hover:-translate-y-1 transition-transform"
            >
              <div className={`w-12 h-12 ${feature.color} border-2 border-black dark:border-white shadow-neo-sm flex items-center justify-center mb-4`}>
                <feature.icon size={24} className="text-black" />
              </div>
              <h3 className="text-xl font-black uppercase mb-2">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="border-2 border-black dark:border-white shadow-neo bg-white dark:bg-neo-dark-card p-8 md:p-12">
          <h2 className="text-3xl font-black uppercase text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload Media', desc: 'Audio, video, or a link — whatever you have.' },
              { step: '02', title: 'AI Transcribes', desc: 'Our engine breaks it into chunks and transcribes each one.' },
              { step: '03', title: 'Review & Chat', desc: 'Scroll through timestamps, bookmark moments, ask AI anything.' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-black text-neo-yellow border-2 border-black dark:border-white inline-block px-4 py-2 mb-4 shadow-neo-sm">{item.step}</div>
                <h3 className="text-lg font-black uppercase mb-2">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16 pb-12">
          <h2 className="text-4xl font-black uppercase mb-4">Ready to Transcribe?</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">Free tier: up to 2 minutes. Verified accounts unlock full length.</p>
          <NeoButton variant="primary" onClick={onGetStarted} className="px-10 py-4 text-lg flex items-center gap-2 mx-auto shadow-neo active:shadow-none active:translate-y-1 transition-all">
            Start Transcribing <CheckCircle2 size={20} />
          </NeoButton>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
