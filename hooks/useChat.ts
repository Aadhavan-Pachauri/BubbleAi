
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './useToast';
import { Project, Message, Chat, WorkspaceMode, ProjectPlatform, ProjectType, ChatWithProjectData } from '../types';
import { 
    getAllChatsForUser, 
    addMessage, 
    createProject, 
    updateProject as updateDbProject, 
    createChat as createDbChat, 
    updateChat as updateDbChat, 
    getMessages, 
    deleteChat, 
    extractAndSaveMemory, 
    updateMessagePlan,
    getChatsForProject
} from '../services/databaseService';
import { generateProjectDetails, classifyUserIntent, generateChatTitle } from '../services/geminiService';
import { runAgent } from '../agents';
import { User } from '@supabase/supabase-js';
// FIX: Imported missing AgentExecutionResult type.
import { AgentExecutionResult } from '../agents/types';

const DUMMY_AUTONOMOUS_PROJECT: Project = {
  id: 'autonomous-project',
  user_id: 'unknown',
  name: 'Autonomous Chat',
  description: 'A personal chat with the AI.',
  status: 'In Progress',
  platform: 'Web App',
  project_type: 'conversation',
  default_model: 'gemini-2.5-flash',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface UseChatProps {
    user: User | null;
    geminiApiKey: string | null;
    workspaceMode: WorkspaceMode;
    // For admin page to view other users' projects
    adminProject?: Project | null; 
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

export const useChat = ({ user, geminiApiKey, workspaceMode, adminProject }: UseChatProps) => {
    const { supabase, profile } = useAuth();
    const { addToast } = useToast();

    const [allChats, setAllChats] = useState<ChatWithProjectData[]>([]);
    const [activeChat, setActiveChat] = useState<ChatWithProjectData | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreatingChat, setIsCreatingChat] = useState(false);

    const activeProject = useMemo(() => adminProject ?? activeChat?.projects ?? null, [adminProject, activeChat]);
    
    // Fetch user's chats (or project's chats for admin)
    useEffect(() => {
        if (!supabase || !user) return;
        
        const fetchChats = async () => {
            setIsLoading(true);
            try {
                let chats: ChatWithProjectData[] = [];
                if (adminProject) { // Admin viewing a specific project
                    const projectChats = await getChatsForProject(supabase, adminProject.id);
                    // Manually attach project data for consistency
                    chats = projectChats.map(c => ({...c, projects: adminProject }));
                } else if(user) { // Regular user or admin in autonomous mode
                    chats = await getAllChatsForUser(supabase, user.id);
                }
                setAllChats(chats);
            } catch (error) {
                addToast("Could not load conversations.", "error");
            } finally {
                setIsLoading(false);
            }
        };
        fetchChats();
    }, [user, supabase, addToast, adminProject]);

    // Fetch messages for active chat
    useEffect(() => {
        const fetchMessages = async () => {
            if (activeChat && supabase) {
                setIsLoading(true);
                try {
                    const history = await getMessages(supabase, activeChat.id);
                    setMessages(history);
                } catch (error) { setMessages([]); } 
                finally { setIsLoading(false); }
            } else {
                setMessages([]);
            }
        };
        fetchMessages();
    }, [activeChat, supabase]);

    const handleUpdateChat = useCallback(async (chatId: string, updates: Partial<Chat>) => {
        if (!supabase) return;
        try {
            const updatedChat = await updateDbChat(supabase, chatId, updates);
            setAllChats(prev => prev.map(c => c.id === chatId ? { ...c, ...updatedChat } : c));
            setActiveChat(prev => (prev?.id === chatId ? { ...prev, ...updatedChat } : prev));
        } catch (error) { console.error("Failed to update chat", error); }
    }, [supabase]);

    // Auto-generate chat title
    useEffect(() => {
        if (messages.length === 2 && activeChat && geminiApiKey && messages[0].sender === 'user' && messages[1].sender === 'ai' && activeChat.name === messages[0].text) {
            generateChatTitle(messages[0].text, messages[1].text, geminiApiKey).then(title => {
                if (activeChat) {
                    handleUpdateChat(activeChat.id, { name: title });
                }
            });
        }
    }, [messages, activeChat, geminiApiKey, handleUpdateChat]);

    const handleSelectChat = (chat: ChatWithProjectData) => {
        setActiveChat(chat);
    };

    const handleDeleteChat = async (chatId: string) => {
        if (!supabase) return;
        try {
            await deleteChat(supabase, chatId);
            setAllChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChat?.id === chatId) {
                setActiveChat(null);
            }
            addToast('Chat deleted.', 'info');
        } catch (error) {
            addToast('Failed to delete chat.', 'error');
        }
    };
    
    const handleSendMessage = useCallback(async (text: string, files: File[] | null = null, chatToUse: ChatWithProjectData | null = activeChat): Promise<AgentExecutionResult> => {
      if ((!text.trim() && (!files || files.length === 0)) || !supabase || !user || !chatToUse || !geminiApiKey) return { messages: [] };

      const tempUserMessageId = `temp-user-${Date.now()}`;
      const tempAiMessageId = `temp-ai-${Date.now()}`;

      // 1. Prepare optimistic user message data
      const userMessageData: Omit<Message, 'id' | 'created_at'> = {
        project_id: chatToUse.project_id, chat_id: chatToUse.id, user_id: user.id, text, sender: 'user',
      };
      
      const tempUserMessage: Message = { ...userMessageData, id: tempUserMessageId, created_at: new Date().toISOString() };
      
      // We can't show image previews optimistically without more complex state,
      // but we can prepare the data for the DB call.
      if (files && files.length > 0) {
          try {
              const base64Strings = await Promise.all(files.map(fileToBase64));
              userMessageData.image_base64 = files.length === 1 ? base64Strings[0] : JSON.stringify(base64Strings);
              // Add to temp message as well so it's there for agent history
              tempUserMessage.image_base64 = userMessageData.image_base64;
          } catch (error) {
              addToast("Failed to read the attached file(s).", 'error');
              console.error("File read error:", error);
              return { messages: [] };
          }
      }
      
      // 2. Prepare temporary AI message for typing indicator
      const tempAiMessage: Message = { id: tempAiMessageId, project_id: chatToUse.project_id, chat_id: chatToUse.id, text: '', sender: 'ai' };

      // 3. Perform a single state update for instant UI feedback
      setIsLoading(true);
      setMessages(prev => [...prev, tempUserMessage, tempAiMessage]);

      try {
        // 4. Run async operations in the background
        const savedUserMessage = await addMessage(supabase, userMessageData);
        
        // Quietly update the temp user message with the real one for key stability
        setMessages(prev => prev.map(m => m.id === tempUserMessageId ? savedUserMessage : m));
        
        const historyForAgent = [...messages.filter(m => m.id !== tempUserMessage.id && m.id !== tempAiMessage.id), savedUserMessage];

        const onStreamChunk = (chunk: string) => {
            let isEvent = false;
            try {
                const event = JSON.parse(chunk);
                if (event.type === 'image_generation_start') {
                    isEvent = true;
                    setMessages(prev => prev.map(m => m.id === tempAiMessageId ? { ...m, text: event.text, imageStatus: 'generating' } : m));
                }
            } catch (e) {}

            if (!isEvent) {
                 setMessages(prev => prev.map(m => m.id === tempAiMessageId ? { ...m, text: m.text + chunk } : m));
            }
        };

        const projectForAgent = chatToUse.projects ?? { ...DUMMY_AUTONOMOUS_PROJECT, user_id: user.id };

        const agentResult = await runAgent({
            prompt: text, files, apiKey: geminiApiKey, model: projectForAgent.default_model,
            project: projectForAgent, chat: chatToUse, user, profile, supabase,
            history: historyForAgent, onStreamChunk, workspaceMode
        });
        
        const { messages: agentMessages, updatedPlan } = agentResult;
        
        const savedAiMessages: Message[] = [];
        for (const messageContent of agentMessages) {
            const savedAiMessage = await addMessage(supabase, { ...messageContent, project_id: chatToUse.project_id });
            savedAiMessages.push(savedAiMessage);
        }

        if (savedUserMessage && savedAiMessages.length > 0) {
            extractAndSaveMemory(supabase, user.id, savedUserMessage.text, savedAiMessages[0].text, chatToUse.project_id)
                .catch(err => console.warn("Background memory extraction failed:", err));
        }
        
        setMessages(prev => {
            // Replace temp AI message with final saved one(s)
            const finalMessages = prev.filter(m => m.id !== tempAiMessageId);
            finalMessages.push(...savedAiMessages);

            // Apply plan updates if any
            if (updatedPlan) {
                return finalMessages.map(m => m.id === updatedPlan.messageId ? { ...m, plan: updatedPlan.plan } : m);
            }
            return finalMessages;
        });

        if (updatedPlan) await updateMessagePlan(supabase, updatedPlan.messageId, updatedPlan.plan);
        return agentResult;

      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
        addToast(errorMessage, "error");
        console.error("Error in handleSendMessage:", e);
        // Clean up temp messages on error
        setMessages(prev => prev.filter(m => m.id !== tempUserMessageId && m.id !== tempAiMessageId));
        return { messages: [] };
      } finally {
        setIsLoading(false);
      }
    }, [activeChat, supabase, user, geminiApiKey, messages, addToast, profile, workspaceMode]);
    
    return {
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
    };
};
