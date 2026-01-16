import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check local storage or system preference on mount
    const savedTheme = localStorage.getItem('neo-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('neo-theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('neo-theme', 'dark');
      setIsDark(true);
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-6 left-6 z-50 p-3 bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white rounded-full hover:scale-105 active:translate-y-1 active:shadow-none transition-all duration-200 group"
      aria-label="Toggle Theme"
    >
      {isDark ? (
        <Sun size={24} className="text-neo-yellow animate-spin-slow" />
      ) : (
        <Moon size={24} className="text-black group-hover:text-neo-blue" />
      )}
    </button>
  );
};