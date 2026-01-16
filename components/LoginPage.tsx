import React from 'react';
import { NeoButton, NeoCard } from './NeoUi';
import { Cloud, HardDrive, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onLoginGoogle: () => void;
  onGuest: () => void;
  isLoading?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginGoogle, onGuest, isLoading }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#F3F4F6] dark:bg-neo-dark text-black dark:text-white transition-colors duration-200">
        {/* Background Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neo-yellow border-4 border-black dark:border-white rounded-full mix-blend-multiply dark:mix-blend-normal dark:opacity-10 opacity-20 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neo-blue border-4 border-black dark:border-white rounded-full mix-blend-multiply dark:mix-blend-normal dark:opacity-10 opacity-20"></div>

        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative z-10">
            
            {/* Brand Section */}
            <div className="space-y-6 text-center md:text-left">
                <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9] drop-shadow-neo dark:drop-shadow-none">
                    Neo<br/><span className="text-neo-pink">Scriber</span>
                </h1>
                <p className="text-xl font-bold bg-white dark:bg-neo-dark-card text-black dark:text-white border-2 border-black dark:border-white p-4 shadow-neo dark:shadow-neo-white inline-block transform -rotate-2">
                    Brutally simple AI transcription.
                </p>
                <div className="space-y-2 text-sm font-mono opacity-70">
                    <p>✓ Powered by Gemini 2.5 Flash</p>
                    <p>✓ Local & Cloud Save Support</p>
                    <p>✓ Video & Audio Processing</p>
                </div>
            </div>

            {/* Login Card */}
            <NeoCard className="flex flex-col gap-6 md:p-12 border-4 shadow-neo-lg dark:shadow-neo-lg-white bg-white dark:bg-neo-dark-card">
                <div className="text-center mb-4">
                    <h2 className="text-2xl font-black uppercase">Authentication</h2>
                    <p className="text-gray-500 dark:text-gray-400 font-mono text-sm mt-1">Select your workspace mode</p>
                </div>

                <NeoButton 
                    onClick={onLoginGoogle} 
                    className="w-full flex items-center justify-center gap-3 py-4 text-lg bg-white hover:bg-gray-50 text-black border-black dark:border-black" // Force light button logic for Google brand consistency or keep generic
                    variant="secondary"
                    disabled={isLoading}
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="Google" />
                    {isLoading ? 'Connecting...' : 'Continue with Google'}
                </NeoButton>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-black dark:border-white/20"></div>
                    <span className="flex-shrink mx-4 text-black font-bold text-xs uppercase bg-neo-yellow px-2 border border-black">OR</span>
                    <div className="flex-grow border-t border-black dark:border-white/20"></div>
                </div>

                <NeoButton 
                    onClick={onGuest} 
                    variant="secondary" 
                    className="w-full flex items-center justify-center gap-3 py-3 text-sm opacity-80 hover:opacity-100"
                >
                    <HardDrive size={18} />
                    Continue as Guest
                    <ArrowRight size={16} />
                </NeoButton>

                <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 mt-4 leading-tight">
                    By continuing, you agree to our Terms of Service. <br/>
                    Guest mode saves data to your browser's LocalStorage only.
                </p>
            </NeoCard>
        </div>
    </div>
  );
};