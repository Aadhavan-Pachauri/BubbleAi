import { GoogleGenAI, Type } from "@google/genai";
import { AgentInput, AgentOutput, AgentExecutionResult } from '../types';
import { autonomousInstruction } from './instructions';
import { getUserFriendlyError } from '../errorUtils';
import { generateImage } from '../../services/geminiService';
import { saveMemory } from '../../services/databaseService';
import { ImageModel, MemoryLayer } from '../../types';

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type,
      },
    };
};

export const runAutonomousAgent = async (input: AgentInput): Promise<AgentExecutionResult> => {
    const { prompt, files, apiKey, model, project, chat, history, supabase, user, profile, onStreamChunk, memoryContext } = input;

    try {
        const ai = new GoogleGenAI({ apiKey });
        
        const geminiHistory = history.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model' as 'user' | 'model',
            parts: [{ text: msg.text }],
        })).filter(msg => msg.parts[0].text.trim() !== '');

        const systemInstruction = `Current Timestamp: ${new Date().toISOString()}\n\n${autonomousInstruction}\n\n--- MEMORY CONTEXT ---\n${memoryContext || 'No memory context available.'}`;
        
        const userMessageParts: any[] = [{ text: prompt }];
        if (files && files.length > 0) {
            for (const file of files) {
                const filePart = await fileToGenerativePart(file);
                userMessageParts.unshift(filePart);
            }
        }
        
        const contents = [...geminiHistory, { role: 'user' as const, parts: userMessageParts }];

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents,
            config: { 
                systemInstruction,
                temperature: 0.8,
                topP: 0.9,
            },
        });

        let fullText = '';
        let streamingBuffer = ''; // Tracks what has been sent to the user UI

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                const metaStartIndex = fullText.indexOf('[--METADATA--]');
                
                if (metaStartIndex !== -1) {
                    // We have a metadata block. The visible text is everything before it.
                    const visibleText = fullText.substring(0, metaStartIndex);
                    if (visibleText.length > streamingBuffer.length) {
                        const newChunkToSend = visibleText.substring(streamingBuffer.length);
                        onStreamChunk?.(newChunkToSend);
                        streamingBuffer = visibleText;
                    }
                } else {
                    // No metadata block found yet, so the whole chunk is visible text.
                    onStreamChunk?.(chunkText);
                    streamingBuffer += chunkText;
                }
            }
        }
        
        // --- After stream is complete, parse for actions ---
        
        const metadataRegex = /\[--METADATA--\]([\s\S]*?)\[--METADATA--\]/;
        const metadataMatch = fullText.match(metadataRegex);
        const userVisibleText = (metadataMatch ? fullText.replace(metadataRegex, '') : fullText).trim();

        let parsedMetadata = {
            imagePrompt: null,
            code: null,
            language: null,
            memoryToCreate: null
        };

        if (metadataMatch && metadataMatch[1]) {
            try {
                parsedMetadata = { ...parsedMetadata, ...JSON.parse(metadataMatch[1].trim()) };
            } catch (e) {
                console.warn("Failed to parse metadata JSON from autonomous agent:", e);
                // The user-visible text is still valid, so we can proceed without actions.
            }
        }

        const { imagePrompt, code, language, memoryToCreate } = parsedMetadata;

        // --- Handle Background Memory Creation ---
        if (memoryToCreate && Array.isArray(memoryToCreate) && memoryToCreate.length > 0) {
            Promise.all(memoryToCreate.map((mem: { layer: MemoryLayer; key: string; value: string; }) => 
                saveMemory(supabase, user.id, mem.layer, mem.key, mem.value)
            )).catch(err => console.warn("Autonomous agent failed to save memory:", err));
        }

        // --- Construct Final Response ---

        // Case 1: Code was generated
        if (code && typeof code === 'string' && code.trim()) {
            const messagePayload: AgentOutput[0] = {
                project_id: project.id, chat_id: chat.id, sender: 'ai',
                text: userVisibleText, code: code.trim(), language: language || 'plaintext',
            };
            if (input.profile?.role === 'admin') messagePayload.raw_ai_response = fullText;
            return { messages: [messagePayload] };
        }

        // Case 2: Image was requested
        if (imagePrompt && typeof imagePrompt === 'string' && imagePrompt.trim()) {
            // Send an event to the UI to show the "Generating..." placeholder.
            onStreamChunk?.(JSON.stringify({
                type: 'image_generation_start',
                text: userVisibleText
            }));

            const { data: latestProfile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profileError || !latestProfile) throw profileError || new Error("Could not re-fetch user profile for image generation.");

            const isAdmin = latestProfile.membership === 'admin';
            const modelToUse: ImageModel = latestProfile.preferred_image_model || 'nano_banana';

            if (!isAdmin) {
                const { data: settings, error: settingsError } = await supabase.from('app_settings').select('*').single();
                if (settingsError || !settings) throw settingsError || new Error("Could not load credit cost settings.");
                
                const cost = settings[`cost_image_${modelToUse}`] || 1;
                if (latestProfile.credits < cost) {
                    return { messages: [{ project_id: project.id, chat_id: chat.id, sender: 'ai', text: `Oops! You need ${cost} credits to generate an image, but you only have ${latestProfile.credits}.` }] };
                }
                await supabase.rpc('deduct_credits', { p_user_id: user.id, p_amount: cost });
            }

            const { imageBase64, fallbackOccurred } = await generateImage(imagePrompt, apiKey, modelToUse);
            
            const finalText = fallbackOccurred
                ? `${userVisibleText}\n\n*(Note: The premium image model failed, so I used a faster fallback to generate this image.)*`
                : userVisibleText;

            const messagePayload: AgentOutput[0] = {
                project_id: project.id, chat_id: chat.id, sender: 'ai',
                text: finalText, image_base64: imageBase64, imageStatus: 'complete',
            };
            if (input.profile?.role === 'admin') messagePayload.raw_ai_response = fullText;
            return { messages: [messagePayload] };
        }

        // Case 3: Plain text response
        if (userVisibleText) {
            const messagePayload: AgentOutput[0] = {
                project_id: project.id, chat_id: chat.id, sender: 'ai', text: userVisibleText,
            };
            if (input.profile?.role === 'admin') messagePayload.raw_ai_response = fullText;
            return { messages: [messagePayload] };
        }

        throw new Error("The AI returned an empty response.");

    } catch (error) {
        console.error("Error in runAutonomousAgent:", error);
        const errorMessage = getUserFriendlyError(error);
        const fallbackMessage: AgentOutput[0] = {
            project_id: project.id,
            chat_id: chat.id,
            sender: 'ai',
            text: `An error occurred: ${errorMessage}`,
        };
        return { messages: [fallbackMessage] };
    }
};