import React from 'react';
import { X } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
}

export const NeoButton: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-6 py-3 font-bold border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all duration-100 text-sm md:text-base uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed";
  
  // Adjusted text colors for readability
  const variants = {
    primary: "bg-neo-yellow hover:bg-yellow-300 text-black", // Yellow always black text
    secondary: "bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white", 
    danger: "bg-neo-pink hover:bg-red-400 text-black dark:text-white", // Pink can take both, black is more brutalist, white is readable
    success: "bg-neo-green hover:bg-lime-400 text-black", // Green always black text
    warning: "bg-orange-400 hover:bg-orange-300 text-black"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const NeoCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white p-6 text-black dark:text-white transition-colors duration-200 ${className}`}>
      {children}
    </div>
  );
};

export const NeoBadge: React.FC<{ children: React.ReactNode; color?: string; textColor?: string }> = ({ children, color = 'bg-neo-blue', textColor = 'text-black' }) => {
  return (
    <span className={`${color} ${textColor} px-2 py-1 text-xs font-bold border border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white inline-flex items-center`}>
      {children}
    </span>
  );
};

export const NeoProgressBar: React.FC<{ progress: number; label?: string }> = ({ progress, label }) => {
  return (
    <div className="w-full text-black dark:text-white">
      {label && <div className="text-xs font-bold uppercase mb-1 flex justify-between">
        <span>{label}</span>
        <span>{Math.round(progress)}%</span>
      </div>}
      <div className="w-full h-6 border-2 border-black dark:border-white bg-white dark:bg-zinc-800 p-1">
        <div 
          className="h-full bg-neo-green transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
};

export const NeoModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-neo-dark-card border-4 border-black dark:border-white shadow-neo-lg dark:shadow-neo-lg-white w-full max-w-2xl max-h-[80vh] flex flex-col text-black dark:text-white">
                <div className="bg-neo-yellow dark:bg-neo-yellow border-b-4 border-black dark:border-white p-4 flex justify-between items-center text-black">
                    <h3 className="font-black uppercase text-xl">{title}</h3>
                    <button onClick={onClose} className="hover:bg-black hover:text-white p-1 border-2 border-transparent hover:border-transparent transition-colors">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 dark:text-gray-200">
                    {children}
                </div>
            </div>
        </div>
    );
};