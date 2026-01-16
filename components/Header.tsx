import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { User, Project } from '../types';
import { NeoButton } from './NeoUi';
import { Save, FolderOpen, LogOut, FileText, UserCircle, Cloud, ChevronDown, Clock, Download, type LucideIcon } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  currentProject: Project | null;
  onLogin: () => void;
  onLogout: () => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenLocal: () => void;
  onOpenDrive: () => void;
  recentProjects: Project[];
  onOpenRecent: (p: Project) => void;
}

interface MenuDropdownProps {
  children?: ReactNode;
  className?: string;
}

const MenuDropdown: React.FC<MenuDropdownProps> = ({ children, className = '' }) => (
  <div className={`absolute top-full left-0 mt-2 w-64 bg-white dark:bg-neo-dark-card border-2 border-black dark:border-white shadow-neo dark:shadow-neo-white z-50 animate-in fade-in slide-in-from-top-2 text-black dark:text-white ${className}`}>
    {children}
  </div>
);

interface MenuItemProps {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  shortcut?: string;
  disabled?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon: Icon, label, onClick, shortcut, disabled }) => (
  <button
    onClick={() => {
      if (!disabled) {
          onClick();
      }
    }}
    disabled={disabled}
    className={`w-full text-left px-4 py-3 hover:bg-neo-yellow hover:text-black flex items-center justify-between group transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <div className="flex items-center gap-3">
      {Icon && <Icon size={16} className="group-hover:stroke-black" />}
      <span className="font-bold text-sm uppercase">{label}</span>
    </div>
    {shortcut && <span className="text-xs text-gray-500 dark:text-gray-400 font-mono group-hover:text-black/70">{shortcut}</span>}
  </button>
);

export const Header: React.FC<HeaderProps> = ({
  user,
  currentProject,
  onLogin,
  onLogout,
  onNew,
  onSave,
  onSaveAs,
  onOpenLocal,
  onOpenDrive,
  recentProjects,
  onOpenRecent
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'account' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (action: () => void) => {
      action();
      setOpenMenu(null);
  };

  return (
    <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-white dark:bg-neo-dark-card border-b-2 border-black dark:border-white px-6 py-4 sticky top-0 z-40 transition-colors duration-200" ref={menuRef}>
      
      {/* Brand & File Menu */}
      <div className="flex items-center gap-8 w-full md:w-auto">
        <div className="flex items-center gap-2 select-none">
          <div className="w-8 h-8 bg-neo-pink border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white"></div>
          <span className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Neo<span className="text-neo-pink">Scriber</span></span>
        </div>

        {/* Navigation / Menus */}
        <nav className="flex items-center gap-2 text-black dark:text-white">
            
            {/* FILE MENU */}
            <div className="relative">
                <button 
                    onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
                    className={`font-bold uppercase px-3 py-1 border-2 border-transparent hover:border-black dark:hover:border-white hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-all ${openMenu === 'file' ? 'bg-neo-yellow text-black border-black' : ''}`}
                >
                    File <ChevronDown size={14} />
                </button>
                {openMenu === 'file' && (
                    <MenuDropdown>
                        <MenuItem icon={FileText} label="New Project" onClick={() => handleMenuClick(onNew)} />
                        <div className="border-t-2 border-black dark:border-white my-1"></div>
                        <MenuItem icon={FolderOpen} label="Open Local File..." onClick={() => handleMenuClick(onOpenLocal)} />
                        <MenuItem 
                            icon={Cloud} 
                            label="Open from Drive..." 
                            onClick={() => handleMenuClick(onOpenDrive)} 
                            disabled={!user}
                        />
                        <div className="border-t border-gray-200 dark:border-zinc-800 my-1"></div>
                        <MenuItem icon={Save} label="Save" onClick={() => handleMenuClick(onSave)} shortcut="Ctrl+S" />
                        <MenuItem icon={Download} label="Save As..." onClick={() => handleMenuClick(onSaveAs)} />
                        
                        {/* Recents Sub-section */}
                        {recentProjects.length > 0 && (
                             <>
                                <div className="bg-gray-100 dark:bg-zinc-800 px-4 py-1 text-[10px] font-black uppercase tracking-wider border-y border-gray-200 dark:border-zinc-700 mt-2">
                                    Recent Sessions
                                </div>
                                {recentProjects.slice(0, 3).map(p => (
                                    <button 
                                        key={p.id}
                                        onClick={() => { onOpenRecent(p); setOpenMenu(null); }}
                                        className="w-full text-left px-4 py-2 hover:bg-neo-blue/20 dark:hover:bg-neo-blue/20 text-xs font-mono truncate flex items-center gap-2"
                                    >
                                        <Clock size={12} /> {p.name}
                                    </button>
                                ))}
                             </>
                        )}
                    </MenuDropdown>
                )}
            </div>
        </nav>
      </div>

      {/* Project Title Display */}
      <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2">
        {currentProject && (
            <div className="px-4 py-1 bg-gray-100 dark:bg-zinc-800 border border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white text-xs font-mono font-bold flex items-center gap-2 text-black dark:text-white">
                {currentProject.name}
                {currentProject.sourceType === 'drive' ? <Cloud size={12} className="text-neo-blue"/> : <Save size={12} className="text-gray-500 dark:text-gray-400"/>}
            </div>
        )}
      </div>

      {/* Account Menu */}
      <div className="relative w-full md:w-auto flex justify-end text-black dark:text-white">
          {user ? (
             <>
                 <button 
                    onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
                    className="flex items-center gap-3 pl-4 border-l-2 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold uppercase leading-none">{user.name}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">Connected</div>
                    </div>
                    {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-10 h-10 border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white" />
                    ) : (
                        <div className="w-10 h-10 bg-neo-green border-2 border-black dark:border-white shadow-neo-sm dark:shadow-neo-sm-white flex items-center justify-center font-bold text-xl text-black">
                            {user.name.charAt(0)}
                        </div>
                    )}
                 </button>

                 {openMenu === 'account' && (
                    <MenuDropdown className="right-0 left-auto">
                        <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-800 border-b border-black dark:border-white">
                            <p className="font-bold text-sm">{user.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                        </div>
                        <MenuItem icon={Cloud} label="Drive Settings" onClick={() => alert("Drive permissions active")} />
                        <div className="border-t-2 border-black dark:border-white my-1"></div>
                        <MenuItem icon={LogOut} label="Log Out" onClick={onLogout} />
                    </MenuDropdown>
                 )}
             </>
          ) : (
            <NeoButton variant="primary" onClick={onLogin} className="py-2 px-4 text-xs flex items-center gap-2">
                <UserCircle size={16} /> Log In / Connect
            </NeoButton>
          )}
      </div>
    </header>
  );
};