import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllProfiles, getProjects } from '../../services/databaseService';
import { Profile, Project } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminConfirmationModal } from './AdminConfirmationModal';
import {
    ArrowRightOnRectangleIcon,
    MagnifyingGlassIcon,
    ExclamationTriangleIcon,
    KeyIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';


const FALLBACK_AVATAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23334155'/%3E%3Cpath d='M50 42 C61.046 42 70 50.954 70 62 L30 62 C30 50.954 38.954 42 50 42 Z' fill='white'/%3E%3Ccircle cx='50' cy='30' r='10' fill='white'/%3E%3C/svg%3E`;

type ActionType = 'view_key';

// User Details Modal Component
const Stat: React.FC<{ label: string; value: string | number | null | undefined }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500">{label}</dt>
        <dd className="mt-1 text-sm text-gray-200 break-all">{value || 'N/A'}</dd>
    </div>
);

const AdminUserDetailsModal: React.FC<{ profile: Profile | null; onClose: () => void }> = ({ profile, onClose }) => {
    const { supabase } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (profile) {
            const fetchUserData = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const userProjects = await getProjects(supabase, profile.id);
                    setProjects(userProjects);
                } catch (err) {
                    setError('Failed to load user projects.');
                } finally {
                    setIsLoading(false);
                }
            };
            fetchUserData();
        }
    }, [profile, supabase]);

    if (!profile) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/50 backdrop-blur-md">
                <motion.div
                    // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                    {...{
                      initial: { scale: 0.9, opacity: 0, y: 20 },
                      animate: { scale: 1, opacity: 1, y: 0 },
                      exit: { scale: 0.9, opacity: 0, y: 20 },
                      transition: { type: 'spring', stiffness: 260, damping: 20 },
                    }}
                    className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-bg-secondary/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
                >
                    <header className="flex-shrink-0 p-6 flex justify-between items-center border-b border-white/10">
                        <div className="flex items-center gap-4">
                            <img src={profile.avatar_url || FALLBACK_AVATAR_SVG} alt="Avatar" className="w-12 h-12 rounded-full bg-bg-tertiary" />
                            <div>
                                <h2 className="text-xl font-bold text-white">{profile.roblox_username}</h2>
                                <p className="text-sm text-gray-400">User Details</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>
                    
                    <main className="flex-1 p-6 overflow-y-auto space-y-6">
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-4">Profile Information</h3>
                            <div className="p-4 bg-black/20 rounded-lg">
                                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                    <Stat label="Display Name" value={profile.roblox_username} />
                                    <Stat label="User ID" value={profile.id} />
                                    <Stat label="Avatar URL" value={profile.avatar_url} />
                                    <Stat label="API Key Set" value={profile.gemini_api_key ? 'Yes' : 'No'} />
                                </dl>
                            </div>
                        </section>
                        
                        <section>
                             <h3 className="text-lg font-semibold text-white mb-4">User Projects ({projects.length})</h3>
                             <div className="p-4 bg-black/20 rounded-lg">
                                {isLoading ? (
                                    <div className="text-center text-gray-400">Loading projects...</div>
                                ) : error ? (
                                    <div className="text-center text-red-400 flex items-center justify-center gap-2">
                                        <ExclamationTriangleIcon className="w-5 h-5" /> {error}
                                    </div>
                                ) : projects.length > 0 ? (
                                    <ul className="space-y-3">
                                        {projects.map(p => (
                                            <li key={p.id} className="p-3 bg-bg-tertiary rounded-md border border-white/10">
                                                <p className="font-semibold text-white">{p.name}</p>
                                                <p className="text-sm text-gray-400 line-clamp-1">{p.description}</p>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-center text-gray-500">This user has not created any projects.</div>
                                )}
                             </div>
                        </section>
                    </main>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

// User Card Component
const UserCard: React.FC<{ profile: Profile; onRequestAction: (actionType: ActionType, profile: Profile) => void; onViewDetails: (profile: Profile) => void; }> = ({ profile, onRequestAction, onViewDetails }) => {
    const { impersonateUser } = useAuth();

    return (
        <motion.div
            // FIX: framer-motion props wrapped in a spread object to bypass type errors.
            {...{
              layout: true,
              initial: { opacity: 0, y: 20, scale: 0.95 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: -20, scale: 0.95 },
              transition: { type: 'spring', stiffness: 300, damping: 25 },
            }}
            className={`bg-bg-secondary rounded-xl p-4 border border-bg-tertiary flex flex-col transition-all duration-300 cursor-pointer hover:border-primary-start`}
            onClick={() => onViewDetails(profile)}
        >
            <div className="flex items-start gap-4 mb-4">
                <img
                    src={profile.avatar_url || FALLBACK_AVATAR_SVG}
                    alt={`${profile.roblox_username}'s avatar`}
                    className="w-16 h-16 rounded-full object-cover bg-bg-tertiary flex-shrink-0"
                />
                <div className="overflow-hidden flex-1">
                    <h3 className="text-lg font-bold text-white truncate">{profile.roblox_username}</h3>
                    <p className="text-sm text-gray-400 truncate" title={profile.id}>
                        ID: {profile.id.split('-')[0]}...
                    </p>
                </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                    onClick={(e) => { e.stopPropagation(); impersonateUser(profile); }}
                    title="Impersonate User"
                    className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white/5 text-gray-300 rounded-md hover:bg-white/10 hover:text-white transition-colors"
                >
                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                    <span>View As</span>
                </button>
                 <button
                    onClick={(e) => { e.stopPropagation(); onRequestAction('view_key', profile); }}
                    title="View API Key"
                    className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white/5 text-gray-300 rounded-md hover:bg-white/10 hover:text-white transition-colors"
                >
                    <KeyIcon className="w-4 h-4" />
                    <span>View Key</span>
                </button>
            </div>
        </motion.div>
    );
};

export const AdminUsersPage: React.FC = () => {
    const { supabase } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalConfig, setModalConfig] = useState<any>(null);
    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
    const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);


    const fetchProfiles = useCallback(async () => {
        try {
            const data = await getAllProfiles(supabase);
            setProfiles(data);
        } catch (err) {
            setError('Failed to fetch user profiles.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchProfiles();
        
        const channel = supabase
            .channel('profiles-realtime-admin')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles' },
                () => fetchProfiles()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchProfiles]);

    const handleRequestAction = (actionType: ActionType, profile: Profile) => {
        setSelectedProfile(profile);
        switch (actionType) {
            case 'view_key':
                setModalConfig({
                    title: `${profile.roblox_username}'s API Key`,
                    message: profile.gemini_api_key || 'No key has been set for this user.',
                    confirmText: 'Copy to Clipboard',
                    confirmClassName: 'bg-indigo-600 text-white hover:bg-indigo-700',
                    needsReasonInput: false,
                });
                break;
        }
        setIsModalOpen(true);
    };

    const handleConfirmAction = async (reason?: string) => {
        if (!selectedProfile || !modalConfig) return;

        if (modalConfig.title.includes('API Key')) {
            if (selectedProfile.gemini_api_key) {
                navigator.clipboard.writeText(selectedProfile.gemini_api_key);
            }
            setIsModalOpen(false);
            setSelectedProfile(null);
            setModalConfig(null);
            return;
        }
    };
    
    const filteredProfiles = useMemo(() => {
        if (!searchQuery) return profiles;
        return profiles.filter(p =>
            p.roblox_username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [profiles, searchQuery]);


    if (isLoading) {
        return (
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-bg-secondary rounded-xl p-4 border border-bg-tertiary animate-pulse">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-16 h-16 rounded-full bg-bg-tertiary"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-6 w-3/4 bg-bg-tertiary rounded"></div>
                                <div className="h-4 w-1/2 bg-bg-tertiary rounded"></div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="h-9 bg-bg-tertiary rounded-md"></div>
                            <div className="h-9 bg-bg-tertiary rounded-md"></div>
                        </div>
                    </div>
                 ))}
             </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <ExclamationTriangleIcon className="w-12 h-12 text-error mb-4" />
                <h2 className="text-xl font-semibold text-white">An Error Occurred</h2>
                <p className="text-gray-400">{error}</p>
            </div>
        );
    }
    
    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">All Users</h1>
                    <p className="text-gray-400 mt-1">{profiles.length} total users</p>
                </div>
                <div className="relative w-72">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search by name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-bg-secondary/50 border border-bg-tertiary rounded-lg pl-10 pr-4 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-start"
                    />
                </div>
            </div>
            
            <AnimatePresence>
                {filteredProfiles.length > 0 ? (
                    <motion.div
                        // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                        {...{
                          layout: true,
                        }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    >
                        {filteredProfiles.map(profile => (
                            <UserCard 
                                key={profile.id} 
                                profile={profile} 
                                onRequestAction={handleRequestAction} 
                                onViewDetails={setViewingProfile}
                            />
                        ))}
                    </motion.div>
                ) : (
                    <motion.div
                        // FIX: framer-motion props wrapped in a spread object to bypass type errors.
                        {...{
                          initial: { opacity: 0, y: 10 },
                          animate: { opacity: 1, y: 0 },
                        }}
                        className="text-center py-16"
                    >
                        <MagnifyingGlassIcon className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                        <h3 className="text-xl font-semibold text-white">No Users Found</h3>
                        <p className="text-gray-500">Your search for "{searchQuery}" did not match any users.</p>
                    </motion.div>
                )}
            </AnimatePresence>
            
            <AdminConfirmationModal
                isOpen={isModalOpen}
                config={modalConfig}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleConfirmAction}
            />

            <AdminUserDetailsModal 
                profile={viewingProfile}
                onClose={() => setViewingProfile(null)}
            />
        </div>
    );
};