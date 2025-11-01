
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { ChatView } from '../chat/ChatView';
import { ProjectsPage } from '../pages/ProjectsPage';
import { TopBar } from '../dashboard/TopBar';
import { Project, Message, Chat, WorkspaceMode, ProjectPlatform, ProjectType, ChatWithProjectData } from '../../types';
import { SettingsPage } from '../pages/SettingsPage';
import { useAuth } from '../../contexts/AuthContext';
import { updateProject as updateDbProject, createProject, createChat as createDbChat, getAllChatsForUser } from '../../services/databaseService';
import { StatusBar } from '../admin/ImpersonationBanner';
import { CoCreatorWorkspace } from '../cocreator/CoCreatorWorkspace';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { generateProjectDetails, classifyUserIntent } from '../../services/geminiService';
import { useToast } from '../../hooks/useToast';
import { useChat } from '../../hooks/useChat';
import { useWindowSize } from '../../hooks/useWindowSize';
import AuroraCanvas from '../ui/AuroraCanvas';

// New Community Page Placeholders
import { MarketplacePage } from '../community/MarketplacePage';
import { MessagesPage } from '../community/MessagesPage';
import { DiscoverPage } from '../community/DiscoverPage';

type View = 'chat' | 'settings';
type HubView = 'projects' | 'marketplace' | 'messages' | 'discover';

interface LayoutProps {
  geminiApiKey: string;
}

export const Layout: React.FC<LayoutProps> = ({ geminiApiKey }) => {
  const { user, supabase, isImpersonating, profile, isAdmin, signOut, stopImpersonating } = useAuth();
  const { addToast } = useToast();
  
  const [view, setView] = useState<View>('chat');
  const [workspaceMode, setWorkspaceMode] = useLocalStorage<WorkspaceMode>('workspaceMode', 'cocreator');
  const [hubView, setHubView] = useState<HubView>('projects');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(-1);

  // NEW state management for sidebar
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false; // md breakpoint
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage('userSidebarCollapsed', false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isNewChat, setIsNewChat] = useState(true);

  const {
      allChats,
      setAllChats,
      activeChat,
      setActiveChat,
      messages,
      setMessages,
      isLoading,
      isCreatingChat,
      setIsCreatingChat,
      activeProject,
      handleUpdateChat,
      handleSelectChat,
      handleDeleteChat,
      handleSendMessage,
  } = useChat({ user, geminiApiKey, workspaceMode });

  const showAurora = useMemo(() => {
    return isNewChat && workspaceMode === 'autonomous' && !activeChat && messages.length === 0;
  }, [isNewChat, workspaceMode, activeChat, messages]);

  const isThinking = isLoading || isCreatingChat;
  const [loadingMessage, setLoadingMessage] = useState('Bubble is ready');
  const loadingTexts = useMemo(() => [
    "Thinking...", "Analyzing request...", "Consulting memory...", 
    "Formulating plan...", "Generating code...", "Adapting to updates..."
  ], []);

  useEffect(() => {
    let intervalId: number | undefined;
    if (isThinking) {
        let currentIndex = 0;
        setLoadingMessage(loadingTexts[currentIndex]);
        intervalId = window.setInterval(() => {
            currentIndex = (currentIndex + 1) % loadingTexts.length;
            setLoadingMessage(loadingTexts[currentIndex]);
        }, 2500);
    } else {
        setLoadingMessage('Bubble is ready');
    }
    return () => {
        if (intervalId) window.clearInterval(intervalId);
    };
  }, [isThinking, loadingTexts]);
  
  const handleLogoutAction = isImpersonating ? stopImpersonating : signOut;

  useEffect(() => {
    setWorkspaceMode('autonomous');
  }, []);

  const autonomousChats = useMemo(() => {
    return allChats.filter(c => !c.project_id);
  }, [allChats]);
  
  const chatsForSidebar = useMemo(() => {
    if (workspaceMode === 'cocreator') {
        if (activeProject) {
            return allChats.filter(c => c.project_id === activeProject.id);
        } else {
            return autonomousChats;
        }
    }
    return autonomousChats;
  }, [allChats, workspaceMode, activeProject, autonomousChats]);

  const handleGoToHub = () => {
    setWorkspaceMode('cocreator');
    setHubView('projects');
    setActiveChat(null);
    setView('chat');
    setIsMobileSidebarOpen(false);
    setIsNewChat(false);
  };
  
  const handleGoToSettings = () => {
    setView('settings');
    setIsMobileSidebarOpen(false);
  };

  const handleNewChat = () => {
    setActiveChat(null);
    setView('chat');
    setWorkspaceMode('autonomous');
    setIsMobileSidebarOpen(false);
    setIsNewChat(true);
  };
  
  const handleNewCoCreatorChat = async () => {
    if (!activeProject || !user || !supabase) return;
    setIsCreatingChat(true);
    try {
        const projectChats = allChats.filter(c => c.project_id === activeProject.id);
        const newChatName = `New Chat ${projectChats.length + 1}`;
        const newChat = await createDbChat(supabase, user.id, newChatName, 'build', activeProject.id);
        const newChatWithProjectData: ChatWithProjectData = { ...newChat, projects: activeProject };
        setAllChats(prev => [newChatWithProjectData, ...prev]);
        setActiveChat(newChatWithProjectData);
        setIsMobileSidebarOpen(false);
    } catch (error) {
        addToast('Failed to create a new chat in this project.', 'error');
    } finally {
        setIsCreatingChat(false);
    }
  };

  const handleHamburgerClick = () => {
    const isPersistentNonMobile = workspaceMode === 'autonomous' && !isMobile;
    if (isPersistentNonMobile) {
        setIsSidebarCollapsed(false);
    } else {
        setIsMobileSidebarOpen(true);
    }
  };

  const handleSelectProjectFromHub = async (project: Project) => {
      const chatForProject = allChats
          .filter(c => c.project_id === project.id)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
      
      if (chatForProject) {
          setActiveChat(chatForProject);
      } else {
          const newChat = await createDbChat(supabase!, user!.id, `Main Chat`, 'build', project.id);
          const newChatWithProject: ChatWithProjectData = { ...newChat, projects: project };
          setAllChats(prev => [newChatWithProject, ...prev]);
          setActiveChat(newChatWithProject);
      }
      setView('chat');
      setWorkspaceMode('cocreator');
      setIsNewChat(false);
  };

  const handleCreateCoCreatorProject = async (name: string, platform: ProjectPlatform, projectType: ProjectType): Promise<void> => {
    if (!user || !supabase) return;
    setIsCreatingChat(true);
    try {
        const newProject = await createProject(supabase, user.id, name, platform, projectType);
        addToast(`Created new project: ${name}!`, "success");
        const userChats = await getAllChatsForUser(supabase, user.id);
        setAllChats(userChats);
        handleSelectProjectFromHub(newProject);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to create project: ${errorMessage}`, "error");
        console.error("Error creating co-creator project:", error);
        throw error;
    } finally {
        setIsCreatingChat(false);
    }
};

  const createProjectFromPrompt = async (prompt: string): Promise<void> => {
    if (!user || !supabase) return;
    setIsCreatingChat(true);
    setIsNewChat(false);
    try {
      const { name, description, project_type } = await generateProjectDetails(prompt, geminiApiKey!);
      const platform = project_type === 'roblox_game' ? 'Roblox Studio' : 'Web App';
      
      const newProject = await createProject(supabase, user.id, name, platform, project_type);
      newProject.description = description;
      await updateDbProject(supabase, newProject.id, { description });

      const newChat = await createDbChat(supabase, user.id, name, 'build', newProject.id);
      const newChatWithProject: ChatWithProjectData = { ...newChat, projects: newProject };

      addToast(`Created new project: ${name}!`, "success");
      setAllChats(prev => [newChatWithProject, ...prev]);
      setActiveChat(newChatWithProject);
      setWorkspaceMode('cocreator');
      
      const { projectUpdate } = await handleSendMessage(prompt, null, newChatWithProject);

      if (projectUpdate && newChatWithProject.project_id) {
          await updateDbProject(supabase, newChatWithProject.project_id, projectUpdate);
      }
      return;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to create project: ${errorMessage}`, "error");
        console.error("Error creating project:", error);
    } finally {
        setIsCreatingChat(false);
    }
  };

  const handleFirstMessage = async (prompt: string, files: File[] | null = null) => {
    if (!user || !supabase || !geminiApiKey) return;
    setIsNewChat(false);
    setIsCreatingChat(true);
    try {
      if (workspaceMode === 'autonomous') {
        const newChatName = prompt;
        const newChat = await createDbChat(supabase, user.id, newChatName, 'chat', null);
        const newChatWithProject: ChatWithProjectData = { ...newChat, projects: null };
        setAllChats(prev => [newChatWithProject, ...prev]);
        setActiveChat(newChatWithProject);
        await handleSendMessage(prompt, files, newChatWithProject);
      } else {
        const { intent } = await classifyUserIntent(prompt, geminiApiKey);
        if (intent === 'creative_request') {
          await createProjectFromPrompt(prompt);
        } else {
          addToast("To start a conversation, please switch to Autonomous Mode.", "info");
        }
      }
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : "Could not start your new chat.";
       addToast(errorMessage, "error");
       console.error("Error in handleFirstMessage:", error);
    } finally {
       setIsCreatingChat(false);
    }
  };
  
  const handleLocalSendMessage = async (text: string, files: File[] | null = null) => {
      const { projectUpdate } = await handleSendMessage(text, files);
      if (projectUpdate && activeProject) {
           await updateDbProject(supabase!, activeProject.id, projectUpdate);
           // Refresh chats to get updated project data
           const userChats = await getAllChatsForUser(supabase!, user!.id);
           setAllChats(userChats);
      }
  }
  
  const renderMainContent = () => {
    if (view === 'settings') {
        return <SettingsPage onBack={() => setView('chat')} />;
    }
    
    if (workspaceMode === 'cocreator') {
        if (!activeProject) {
            switch (hubView) {
                case 'marketplace': return <MarketplacePage />;
                case 'messages': return <MessagesPage />;
                case 'discover': return <DiscoverPage />;
                case 'projects':
                default:
                    const projectsForHub = allChats
                        .map(c => c.projects)
                        .filter((p): p is Project => !!p)
                        .reduce((acc, current) => {
                            if (!acc.find(item => item.id === current.id)) {
                                acc.push(current);
                            }
                            return acc;
                        }, [] as Project[]);
                    
                    return (
                        <ProjectsPage
                            profile={profile}
                            onSelectProject={handleSelectProjectFromHub}
                            projects={projectsForHub}
                            onCreateCoCreatorProject={handleCreateCoCreatorProject}
                            onCreateAutonomousProject={createProjectFromPrompt}
                        />
                    );
            }
        }
        
        return (
            <CoCreatorWorkspace
                project={activeProject}
                chat={activeChat}
                geminiApiKey={geminiApiKey!}
                messages={messages}
                isLoadingHistory={isLoading}
                isCreatingChat={isCreatingChat}
                setMessages={setMessages}
                onSendMessage={activeChat ? handleLocalSendMessage : handleFirstMessage}
                onChatUpdate={(updates) => activeChat && handleUpdateChat(activeChat.id, updates)}
                onActiveProjectUpdate={async (updates) => {
                    if (activeProject) {
                        try {
                            await updateDbProject(supabase!, activeProject.id, updates);
                            addToast('Project updated successfully.', 'success');
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "An unknown error occurred";
                            addToast(`Error updating project: ${message}`, 'error');
                            console.error("Error in onActiveProjectUpdate:", error);
                        }
                    }
                }}
                searchQuery={searchQuery}
                onSearchResultsChange={setSearchResults}
                currentSearchResultMessageIndex={currentSearchResultIndex}
                isAdmin={!!isAdmin}
                workspaceMode={workspaceMode}
                projectType={activeProject.project_type === 'website' ? 'website' : 'roblox_game'}
                loadingMessage={loadingMessage}
            />
        );
    }

    return (
        <ChatView
            key={activeChat?.id || 'autonomous-new-chat'}
            project={activeProject}
            chat={activeChat}
            geminiApiKey={geminiApiKey!}
            messages={messages}
            isLoadingHistory={isLoading}
            isCreatingChat={isCreatingChat}
            setMessages={setMessages}
            onSendMessage={activeChat ? handleLocalSendMessage : handleFirstMessage}
            onChatUpdate={(updates) => activeChat && handleUpdateChat(activeChat.id, updates)}
            onActiveProjectUpdate={null}
            searchQuery={searchQuery}
            onSearchResultsChange={setSearchResults}
            currentSearchResultMessageIndex={currentSearchResultIndex}
            isAdmin={!!isAdmin}
            workspaceMode={workspaceMode}
            loadingMessage={loadingMessage}
            showAurora={showAurora}
        />
    );
  };
  
  const handleNewChatClick = () => {
    if (workspaceMode === 'cocreator' && activeProject) {
        handleNewCoCreatorChat();
    } else {
        handleNewChat();
    }
  };

  return (
    <div className={`flex flex-col h-screen w-full font-sans text-text-primary ${showAurora ? 'bg-transparent' : 'bg-bg-secondary'}`}>
      {showAurora && <AuroraCanvas />}
      <StatusBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          allChats={chatsForSidebar}
          activeChatId={activeChat?.id}
          onSelectChat={(chat) => {
            handleSelectChat(chat);
            setView('chat');
            if (chat.project_id) { setWorkspaceMode('cocreator'); } 
            else { setWorkspaceMode('autonomous'); }
            setIsMobileSidebarOpen(false);
            setIsNewChat(false);
          }}
          onNewChatClick={handleNewChatClick}
          onUpdateChat={handleUpdateChat}
          onDeleteChat={handleDeleteChat}
          onSettingsClick={handleGoToSettings}
          onGoToHub={handleGoToHub}
          onSignOut={handleLogoutAction}
          profile={profile}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          workspaceMode={workspaceMode}
          isAdmin={isAdmin}
          activeProject={activeProject}
          isPersistent={workspaceMode === 'autonomous' && !isMobile}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            onGoToHub={handleGoToHub}
            onAccountSettingsClick={handleGoToSettings}
            onProjectSettingsClick={() => { /* TODO */ }}
            onLogout={handleLogoutAction}
            activeProjectName={activeProject?.name ?? null}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            workspaceMode={workspaceMode}
            onWorkspaceModeChange={(mode) => setWorkspaceMode(mode)}
            isProjectView={!!activeProject}
            onHamburgerClick={handleHamburgerClick}
            showHamburger={isMobile || workspaceMode === 'cocreator' || (workspaceMode === 'autonomous' && isSidebarCollapsed)}
            isThinking={isThinking}
            onSwitchToAutonomous={handleNewChat}
            onSwitchToCocreator={handleGoToHub}
            hubView={hubView}
            onHubViewChange={setHubView}
            loadingMessage={loadingMessage}
            showAurora={showAurora}
          />
          <main className={`flex-1 overflow-y-auto ${showAurora ? 'bg-transparent' : 'bg-bg-primary'} px-2 md:px-0`}>
            {renderMainContent()}
          </main>
        </div>
      </div>
    </div>
  );
};
