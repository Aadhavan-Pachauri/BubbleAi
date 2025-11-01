

import React, { useState, useEffect, useRef } from 'react';
import { Chat, Profile, WorkspaceMode, Project, ChatWithProjectData } from '../../types';
import { Cog6ToothIcon, PencilIcon, PlusIcon, MagnifyingGlassIcon, ArrowLeftOnRectangleIcon, TrashIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarToggleButton: React.FC<{
  isCollapsed: boolean;
  onToggle: () => void;
}> = ({ isCollapsed, onToggle }) => {
  return (
    <motion.button
      onClick={onToggle}
      className="p-1.5 text-gray-400 rounded-md hover:bg-white/10 hover:text-white transition-colors"
      title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      // FIX: framer-motion props wrapped in a spread object to bypass type errors.
      {...{
        animate: { rotate: isCollapsed ? 180 : 0 },
        transition: { duration: 0.3 },
      }}
    >
      <ChevronDoubleLeftIcon className="w-5 h-5" />
    </motion.button>
  );
};

const FALLBACK_AVATAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23334155'/%3E%3Cpath d='M50 42 C61.046 42 70 50.954 70 62 L30 62 C30 50.954 38.954 42 50 42 Z' fill='white'/%3E%3Ccircle cx='50' cy='30' r='10' fill='white'/%3E%3C/svg%3E`;

interface UserFooterProps {
    profile: Profile | null;
    onSettingsClick: () => void;
    onGoToHub: () => void;
    onSignOut: () => void;
}

const UserFooter: React.FC<UserFooterProps> = ({ profile, onSettingsClick, onGoToHub, onSignOut }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const displayName = profile?.roblox_username || 'User';

    return (
        <div ref={menuRef} className="relative mt-auto flex-shrink-0 pt-2 border-t border-border-color">
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                        {...{
                          initial: { opacity: 0, y: 10, scale: 0.95 },
                          animate: { opacity: 1, y: 0, scale: 1 },
                          exit: { opacity: 0, y: 10, scale: 0.95 },
                          transition: { duration: 0.15, ease: 'easeOut' },
                        }}
                        className="absolute bottom-full left-0 mb-2 w-full bg-bg-tertiary/90 backdrop-blur-md border border-border-color rounded-lg shadow-2xl z-50 overflow-hidden p-1.5"
                    >
                        <button onClick={onSettingsClick} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-200 rounded-md hover:bg-white/10 hover:text-white transition-colors">
                            <Cog6ToothIcon className="w-5 h-5" />
                            <span>Settings</span>
                        </button>
                        <button onClick={onGoToHub} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-200 rounded-md hover:bg-white/10 hover:text-white transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                             <span>Co-Creator Hub</span>
                        </button>
                        <button onClick={onSignOut} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-200 rounded-md hover:bg-white/10 hover:text-white transition-colors">
                            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                            <span>Logout</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
            <button
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors text-gray-200 hover:bg-white/5"
            >
                <img src={profile?.avatar_url || FALLBACK_AVATAR_SVG} alt="Avatar" className="w-8 h-8 rounded-full bg-bg-tertiary" />
                <div className="flex-1 text-left min-w-0">
                    <span className="block truncate font-medium text-white">{displayName}</span>
                     <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <SparklesIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <span className="truncate">
                            {profile?.membership === 'admin' 
                                ? 'Unlimited Credits' 
                                : `${(profile?.credits ?? 0).toLocaleString()} Credits`}
                        </span>
                    </div>
                </div>
            </button>
        </div>
    );
};

interface LeftSidebarProps {
    allChats: ChatWithProjectData[];
    activeChatId?: string;
    onSelectChat: (chat: ChatWithProjectData) => void;
    onNewChatClick: () => void;
    onUpdateChat: (chatId: string, updates: Partial<Chat>) => void;
    onDeleteChat: (chatId: string) => void;
    onSettingsClick: () => void;
    onGoToHub: () => void;
    onSignOut: () => void;
    profile: Profile | null;
    isMobileOpen: boolean;
    onMobileClose: () => void;
    workspaceMode: WorkspaceMode;
    activeProject: Project | null;
    isAdmin?: boolean;
    // New props for collapsible sidebar
    isPersistent?: boolean;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ 
    allChats, activeChatId, onSelectChat, onNewChatClick,
    onUpdateChat, onDeleteChat, onSettingsClick, onGoToHub,
    onSignOut, profile, isMobileOpen, onMobileClose,
    workspaceMode, activeProject, isPersistent = false,
    isCollapsed = false, onToggleCollapse = () => {}
}) => {
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (renamingChatId && renameInputRef.current) {
        renameInputRef.current.focus();
        renameInputRef.current.select();
    }
  }, [renamingChatId]);

  const handleRename = (chat: Chat) => {
    setRenamingChatId(chat.id);
    setRenameValue(chat.name);
  }

  const handleRenameSubmit = () => {
    if (renamingChatId && renameValue.trim()) {
        onUpdateChat(renamingChatId, { name: renameValue.trim() });
    }
    setRenamingChatId(null);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleRenameSubmit();
    } else if (e.key === 'Escape') {
        setRenamingChatId(null);
    }
  }
  
  const sidebarContent = (
    <>
        <div className="flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between">
                <button onClick={onGoToHub} className="flex items-center gap-2 p-2 text-left w-full hover:bg-white/5 rounded-lg transition-colors">
                    <span className="text-xl">🫧</span>
                    <h2 className="text-lg font-semibold text-white truncate">Bubble AI</h2>
                </button>
                {isPersistent && <SidebarToggleButton onToggle={onToggleCollapse} isCollapsed={isCollapsed} />}
            </div>
             <button
                onClick={onNewChatClick}
                title="New Chat"
                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-gray-200 hover:bg-white/5"
            >
                <PlusIcon className="w-5 h-5" />
                <span>New Chat</span>
            </button>
             <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Search chats..."
                    className="w-full bg-bg-primary border border-border-color rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-start"
                />
            </div>
        </div>
      
      <div className="flex-1 flex flex-col overflow-y-auto pr-1 mt-2">
        {workspaceMode === 'cocreator' && activeProject && (
            <div className="px-3 pt-2 pb-3 mb-2 border-b border-border-color">
                <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Project</p>
                <h3 className="font-semibold text-white truncate mt-1">{activeProject.name}</h3>
            </div>
        )}
        {allChats.length > 0 ? (
          <div className="space-y-1">
             {allChats.map(chat => (
                <button
                    key={chat.id}
                    onClick={() => renamingChatId !== chat.id && onSelectChat(chat)}
                    title={chat.name}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors relative group
                        ${activeChatId === chat.id 
                            ? 'bg-primary-start text-white' 
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }
                    `}
                >
                    <span className="line-clamp-2 pr-12">
                        {renamingChatId === chat.id ? (
                            <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={handleRenameSubmit}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-transparent outline-none ring-1 ring-primary-start rounded -m-1 p-1"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                           chat.name 
                        )}
                    </span>
                    {renamingChatId !== chat.id && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center bg-inherit rounded">
                            <button onClick={(e) => { e.stopPropagation(); handleRename(chat); }} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-black/20" title="Rename">
                                <PencilIcon className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-black/20" title="Delete">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </button>
             ))}
          </div>
        ) : (
             <div className="px-3 text-sm text-center text-gray-500 mt-4">
                {workspaceMode === 'cocreator' && !activeProject
                    ? 'This user has no autonomous chats.'
                    : workspaceMode === 'cocreator'
                    ? 'No chats in this project yet.' 
                    : 'No conversations yet.'}
             </div>
        )}
      </div>

      <UserFooter 
        profile={profile}
        onSettingsClick={onSettingsClick}
        onGoToHub={onGoToHub}
        onSignOut={onSignOut}
      />
    </>
  );

  return (
    <>
        {/* Overlay Sidebar (for Mobile and non-persistent modes) */}
        <AnimatePresence>
            {isMobileOpen && (
                <>
                    <motion.div
                        // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                        {...{
                          initial: { opacity: 0 },
                          animate: { opacity: 1 },
                          exit: { opacity: 0 },
                          transition: { duration: 0.2 },
                        }}
                        onClick={onMobileClose}
                        className="fixed inset-0 bg-black/60 z-40 md:hidden"
                        aria-hidden="true"
                    />
                    <motion.aside
                        // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                        {...{
                          initial: { x: '-100%' },
                          animate: { x: '0%' },
                          exit: { x: '-100%' },
                          transition: { type: 'spring', stiffness: 300, damping: 30 },
                        }}
                        className="fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col bg-bg-secondary p-2"
                    >
                        {sidebarContent}
                    </motion.aside>
                </>
            )}
        </AnimatePresence>

        {/* Persistent Desktop Sidebar */}
        {isPersistent && !isCollapsed && (
            <aside className="hidden md:flex w-72 flex-col bg-bg-secondary p-2 flex-shrink-0 relative z-20">
                {sidebarContent}
            </aside>
        )}
    </>
  );
};