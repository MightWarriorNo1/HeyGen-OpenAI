import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState, useCallback } from 'react';
import OpenAI from 'openai';
import { Room, RoomEvent, VideoPresets, RemoteTrack } from 'livekit-client';
import { getAccessToken, createStreamingSession, startStreamingSession, sendStreamingTask, HeyGenSessionInfo } from './services/api';
import { Video } from './components/reusable/Video';
import { Toaster } from "@/components/ui/toaster";
import { Camera, Loader2, Paperclip } from 'lucide-react';
import { SpeechRecognitionService } from './utils/speechRecognition';
import AvatarTest from './components/reusable/AvatarTest';

interface ChatMessageType {
  role: string;
  message: string;
  media?: {
    file: File;
    type: 'photo' | 'video';
  };
};

function App() {
  //Toast
  const { toast } = useToast()

  const [isListening, setIsListening] = useState<boolean>(false);
  const [avatarSpeech, setAvatarSpeech] = useState<string>('');
  const [stream, setStream] = useState<MediaStream>();
  const [sessionInfo, setSessionInfo] = useState<HeyGenSessionInfo | undefined>();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isVisionMode, setIsVisionMode] = useState<boolean>(false);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const visionVideoRef = useRef<HTMLVideoElement>(null);
  const [visionCameraStream, setVisionCameraStream] = useState<MediaStream | null>(null);
  const visionMonitorIntervalRef = useRef<number | null>(null);
  const lastSampleImageDataRef = useRef<ImageData | null>(null);
  const stabilityStartRef = useRef<number | null>(null);
  const nextAllowedAnalysisAtRef = useRef<number>(0);
  const livekitRoomRef = useRef<Room | null>(null);
  const speechService = useRef<SpeechRecognitionService | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const greetingRef = useRef<string | null>(null);
  const greetingRetryCountRef = useRef<number>(0);
  const isStoppingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const shouldStopOnUserSpeechRef = useRef<boolean>(false);
  const [isAvatarFullScreen, setIsAvatarFullScreen] = useState<boolean>(false);
  const [hasUserStartedChatting, setHasUserStartedChatting] = useState<boolean>(false);
  const [videoNeedsInteraction, setVideoNeedsInteraction] = useState<boolean>(false);
  const [showAvatarTest, setShowAvatarTest] = useState<boolean>(false);
  const [hasGreeted, setHasGreeted] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessageType[]>([
    // {
    //   role: 'user',
    //   message: 'hi, how are you!'
    // },
    // {
    //   role: 'assistant',
    //   message: 'I am fine, Thank you for asking. How about you!'
    // },
    // {
    //   role: 'user',
    //   message: 'Explain me about python!'
    // },
    // {
    //   role: 'assistant',
    //   message: "Python is an interpreted, object-oriented, high-level programming language with dynamic semantics. Its high-level built in data structures, combined with dynamic typing and dynamic binding, make it very attractive for Rapid Application Development, as well as for use as a scripting or glue language to connect existing components together. Python's simple, easy to learn syntax emphasizes readability and therefore reduces the cost of program maintenance. Python supports modules and packages, which encourages program modularity and code reuse. The Python interpreter and the extensive standard library are available in source or binary form without charge for all major platforms, and can be freely distributed."
    // },
    // {
    //   role: 'user',
    //   message: 'hi, how are you!'
    // },

  ]);
  // Function to exit vision mode
  const exitVisionMode = () => {
    setIsVisionMode(false);
    // do not stop avatar; just remove overlay and release camera if it was owned by modal
    if (visionCameraStream) {
      visionCameraStream.getTracks().forEach(t => t.stop());
      setVisionCameraStream(null);
    }
  };

  // Control avatar sizing - always full screen
  useEffect(() => {
    setIsAvatarFullScreen(true);
  }, []);

  // Set up vision camera video when stream is available
  useEffect(() => {
    if (visionCameraStream && visionVideoRef.current) {
      visionVideoRef.current.srcObject = visionCameraStream;
    }
  }, [visionCameraStream]);


  const [startAvatarLoading, setStartAvatarLoading] = useState<boolean>(false);
  const [isAvatarRunning, setIsAvatarRunning] = useState<boolean>(false);
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  let timeout: number | undefined;


  const apiKey: string | undefined = import.meta.env.VITE_XAI_API_KEY;
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.x.ai/v1",
    dangerouslyAllowBrowser: true,
  });


  // Function to handle speech recognition
  const handleStartListening = async () => {
    console.log('handleStartListening called', { speechService: !!speechService.current, isListening, isAiProcessing });
    if (speechService.current && !isListening && !isAiProcessing) {
      try {
        console.log('Starting speech recognition...');
        await speechService.current.startListening();
        setIsListening(true);
        console.log('Speech recognition started successfully');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setIsListening(false);
      }
    } else {
      console.log('Cannot start speech recognition:', {
        hasService: !!speechService.current,
        isListening,
        isAiProcessing
      });
    }
  };


  // Function to handle speech recognition results
  const handleSpeechResult = async (transcript: string) => {
    console.log('Speech result received:', transcript);
    try {
      // Mark that user has started chatting
      setHasUserStartedChatting(true);

      // Add user message to chat
      const updatedMessages = [...chatMessages, { role: 'user', message: transcript }];
      setChatMessages(updatedMessages);

      // Set loading state
      setIsAiProcessing(true);

      // Get AI response using xAI with full conversation context
      const aiResponse = await openai.chat.completions.create({
        model: 'grok-2-latest',
        messages: [
          {
            role: 'system',
            content: `You are iSolveUrProblems, a hilariously helpful AI assistant with the personality of a witty comedian who happens to be incredibly smart. Your mission: solve problems while making people laugh out loud!

PERSONALITY TRAITS:
- Crack jokes, puns, and witty observations constantly
- Use self-deprecating humor and playful sarcasm
- Make pop culture references and clever wordplay
- Be genuinely helpful while being absolutely hilarious
- React to images/videos with funny commentary
- Remember EVERYTHING from the conversation (text, images, videos, vision data)
- Build on previous jokes and references throughout the conversation

CONVERSATION MEMORY:
- Remember all previous messages, images, videos, and vision analysis
- Reference past conversation elements in your responses
- Build running jokes and callbacks
- Acknowledge when you're seeing something new vs. referencing something old

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
          },
          ...updatedMessages.map(msg => {
            if (msg.media) {
              return {
                role: msg.role as 'user' | 'assistant',
                content: `${msg.message}\n\n[Media attached: ${msg.media.type} - ${msg.media.file.name}]`
              };
            }
            return { role: msg.role as 'user' | 'assistant', content: msg.message };
          })
        ],
        temperature: 0.8,
        max_tokens: 300
      });

      const aiMessage = aiResponse.choices[0].message.content || '';
      // Add AI response to chat
      setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
      // Set avatar speech to AI message so avatar can speak it
      setAvatarSpeech(aiMessage);

      // Clear loading state
      setIsAiProcessing(false);
      } catch (error: unknown) {
      console.error('Error processing speech result:', error);
      setIsAiProcessing(false);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
          description: (error as Error).message,
      });
    }
  };

  // Function to handle speech recognition errors
  const handleSpeechError = (error: string) => {
    console.error('Speech recognition error:', error);
    toast({
      variant: "destructive",
      title: "Speech Recognition Error",
      description: error,
    });
    setIsListening(false);
  };

  // Store stopAvatarSpeech reference so it can be accessed by the callback
  const stopAvatarSpeechRef = useRef<(() => Promise<void>) | null>(null);
  
  // Function to stop the avatar's speech (via REST task)
  // Use 'chat' task type which may interrupt better than 'repeat'
  const stopAvatarSpeech = useCallback(async () => {
    try {
      if (sessionInfo?.session_id && sessionToken && !isStoppingRef.current) {
        // Set flags immediately to prevent new speech tasks and show loading state
        isStoppingRef.current = true;
        setIsStopping(true);
        
        // Cancel any pending API requests
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // Clear avatar speech immediately to prevent useEffect from sending new tasks
        setAvatarSpeech('');
        
        // Temporarily mute/pause audio to stop buffered speech immediately
        // This provides instant client-side feedback while server interrupts process
        let wasMuted = false;
        let wasPaused = false;
        if (mediaStream.current) {
          wasMuted = mediaStream.current.muted;
          wasPaused = mediaStream.current.paused;
          // Mute immediately for instant feedback
          mediaStream.current.muted = true;
          // Brief pause to stop buffered audio
          if (!wasPaused) {
            mediaStream.current.pause();
          }
        }
        
        // Send multiple rapid interrupt tasks using 'chat' type
        // 'chat' type typically interrupts active speech better than 'repeat'
        const interruptPromises = [];
        try {
          // Send interrupts simultaneously (fire and forget pattern for speed)
          for (let i = 0; i < 5; i++) {
            const interruptController = new AbortController();
            interruptPromises.push(
              sendStreamingTask(sessionToken, sessionInfo.session_id, '.', 'chat', interruptController.signal)
                .catch(e => {
                  if (e?.name !== 'AbortError' && e?.code !== 'ERR_CANCELED') {
                    console.error(`Interrupt task ${i + 1} error:`, e);
                  }
                })
            );
          }
          
          // Wait for interrupts to be sent (don't wait for all to complete)
          await Promise.allSettled(interruptPromises.slice(0, 2)); // Wait for at least 2
          
        } catch (e: any) {
          // Ignore abort errors (they're expected)
          if (e?.name !== 'AbortError' && e?.code !== 'ERR_CANCELED') {
            console.error('Error sending interrupt tasks:', e);
          }
        }
        
        // Restore audio after brief moment (allows server interrupts to take effect)
        if (mediaStream.current) {
          setTimeout(() => {
            if (mediaStream.current) {
              mediaStream.current.muted = wasMuted;
              if (!wasPaused && !isStoppingRef.current) {
                mediaStream.current.play().catch(console.error);
              }
            }
          }, 300); // Brief delay to let server process interrupts
        }
        
        // Reset flags after a delay to allow for cleanup
        setTimeout(() => {
          isStoppingRef.current = false;
          setIsStopping(false);
        }, 300);
        
        toast({
          title: "Speech Stopped",
          description: "Avatar has stopped talking",
        });
      }
    } catch (error) {
      console.error('Error stopping avatar speech:', error);
      isStoppingRef.current = false;
      setIsStopping(false);
      // Restore audio on error
      if (mediaStream.current) {
        mediaStream.current.muted = false;
        mediaStream.current.play().catch(console.error);
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to stop avatar speech",
      });
    }
  }, [sessionInfo?.session_id, sessionToken]);

  // Update ref when stopAvatarSpeech changes
  useEffect(() => {
    stopAvatarSpeechRef.current = stopAvatarSpeech;
  }, [stopAvatarSpeech]);

  // Function to handle interim speech results (when user starts speaking)
  // This will be called when speech recognition detects interim (partial) results
  const handleInterimSpeech = useCallback((hasSpeech: boolean) => {
    // When user starts speaking (hasSpeech = true) and avatar is currently talking, stop avatar
    // We check avatarSpeech through a ref to get latest value without re-creating callback
    const currentAvatarSpeech = avatarSpeech;
    if (hasSpeech && currentAvatarSpeech && currentAvatarSpeech.trim().length > 0 && !isStoppingRef.current) {
      console.log('User started speaking while avatar is talking - stopping avatar');
      // Use the ref to track so we don't call multiple times rapidly
      if (!shouldStopOnUserSpeechRef.current && stopAvatarSpeechRef.current) {
        shouldStopOnUserSpeechRef.current = true;
        stopAvatarSpeechRef.current();
        // Reset flag after a brief moment
        setTimeout(() => {
          shouldStopOnUserSpeechRef.current = false;
        }, 500);
      }
    }
  }, [avatarSpeech]);

  // Function to handle file uploads
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      // Mark that user has started chatting
      setHasUserStartedChatting(true);

      const newFiles = Array.from(files);

      // Process each file and add to chat immediately
      newFiles.forEach(file => {
        const fileType = file.type.startsWith('image/') ? 'photo' :
          file.type.startsWith('video/') ? 'video' : null;

        if (fileType) {
          // Add media message to chat immediately
          const mediaMessage: ChatMessageType = {
            role: 'user',
            message: `I uploaded a ${fileType}`,
            media: { file, type: fileType }
          };
          setChatMessages(prev => [...prev, mediaMessage]);

          // Process with AI
          processMediaWithAI(file, fileType);
        }
      });

      // Clear the input
      event.target.value = '';

      toast({
        title: "Files processed",
        description: `${newFiles.length} file(s) processed successfully`,
      });
    }
  };


  // Function to convert file to data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Function to handle vision analysis from camera
  const handleVisionAnalysis = async (imageDataUrl: string) => {
    try {
      // Enter vision mode
      setIsVisionMode(true);

      // Set loading state
      setIsAiProcessing(true);

      // Add user message to chat
      const updatedMessages = [...chatMessages, {
        role: 'user',
        message: 'I want to analyze what I see through the camera'
      }];
      setChatMessages(updatedMessages);

      // Build conversation history for vision
      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
      }));

      const messages = [
        {
          role: 'system' as const,
          content: `You are iSolveUrProblems, a hilariously helpful AI assistant with the personality of a witty comedian who happens to be incredibly smart. Your mission: solve problems while making people laugh out loud!

PERSONALITY TRAITS:
- Crack jokes, puns, and witty observations constantly
- Use self-deprecating humor and playful sarcasm
- Make pop culture references and clever wordplay
- Be genuinely helpful while being absolutely hilarious
- React to images/videos with funny commentary
- Remember EVERYTHING from the conversation (text, images, videos, vision data)
- Build on previous jokes and references throughout the conversation

VISION ANALYSIS:
- When analyzing images/videos, make hilarious observations about what you see
- Point out funny details, absurd situations, or comedic elements
- Use your vision analysis to crack jokes while being genuinely helpful
- Reference previous images/videos in the conversation for running gags

CONVERSATION MEMORY:
- Remember all previous messages, images, videos, and vision analysis
- Reference past conversation elements in your responses
- Build running jokes and callbacks
- Acknowledge when you're seeing something new vs. referencing something old

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
        },
        ...conversationHistory,
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: 'I want to analyze what I see through the camera. Please provide a detailed analysis of the image and suggest solutions or insights based on what you observe.'
            },
            {
              type: 'image_url' as const,
              image_url: { url: imageDataUrl, detail: 'high' as const }
            }
          ]
        }
      ];

      const aiResponse = await openai.chat.completions.create({
        model: 'grok-2-vision',
        messages: messages,
        temperature: 0.8,
        max_tokens: 300
      });

      const aiMessage = aiResponse.choices[0].message.content || '';
      // Add AI response to chat
      setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
      // Set avatar speech to AI message so avatar can speak it
      setAvatarSpeech(aiMessage);

      // Clear loading state
      setIsAiProcessing(false);

    } catch (error: unknown) {
      console.error('Error processing vision analysis:', error);
      setIsAiProcessing(false);
      setIsVisionMode(false); // Exit vision mode on error
      toast({
        variant: "destructive",
        title: "Vision Analysis Error",
        description: (error as Error).message || 'Failed to analyze the image. Please try again.',
      });
    }
  };

  // Receive live camera stream from CameraModal when vision starts

  // Function to process media with AI
  const processMediaWithAI = async (file: File, type: 'photo' | 'video') => {
    try {
      // Set loading state
      setIsAiProcessing(true);

      let aiResponse;

      if (type === 'photo') {
        // For images, use vision model
        try {
          const imageDataUrl = await fileToDataUrl(file);

          // Build conversation history for vision
          const conversationHistory = chatMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
          }));

          const messages = [
            {
              role: 'system' as const,
              content: `You are iSolveUrProblems, a hilariously helpful AI assistant with the personality of a witty comedian who happens to be incredibly smart. Your mission: solve problems while making people laugh out loud!

PERSONALITY TRAITS:
- Crack jokes, puns, and witty observations constantly
- Use self-deprecating humor and playful sarcasm
- Make pop culture references and clever wordplay
- Be genuinely helpful while being absolutely hilarious
- React to images/videos with funny commentary
- Remember EVERYTHING from the conversation (text, images, videos, vision data)
- Build on previous jokes and references throughout the conversation

VISION ANALYSIS:
- When analyzing images/videos, make hilarious observations about what you see
- Point out funny details, absurd situations, or comedic elements
- Use your vision analysis to crack jokes while being genuinely helpful
- Reference previous images/videos in the conversation for running gags

CONVERSATION MEMORY:
- Remember all previous messages, images, videos, and vision analysis
- Reference past conversation elements in your responses
- Build running jokes and callbacks
- Acknowledge when you're seeing something new vs. referencing something old

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
            },
            ...conversationHistory,
            {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: `I've shared an image named "${file.name}". Please analyze what you can see and provide helpful insights about the content.`
                },
                {
                  type: 'image_url' as const,
                  image_url: { url: imageDataUrl, detail: 'high' as const }
                }
              ]
            }
          ];

          aiResponse = await openai.chat.completions.create({
            model: 'grok-2-vision',
            messages: messages,
            temperature: 0.8,
            max_tokens: 300
          });

        } catch (visionError) {
          console.warn('Vision analysis failed, falling back to text-only:', visionError);
          // Fallback to text-only analysis
          const conversationHistory = chatMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
          }));

          aiResponse = await openai.chat.completions.create({
            model: 'grok-2-latest',
            messages: [
              {
                role: 'system' as const,
                content: `You are iSolveUrProblems, a hilariously helpful AI assistant with the personality of a witty comedian who happens to be incredibly smart. Your mission: solve problems while making people laugh out loud!

PERSONALITY TRAITS:
- Crack jokes, puns, and witty observations constantly
- Use self-deprecating humor and playful sarcasm
- Make pop culture references and clever wordplay
- Be genuinely helpful while being absolutely hilarious
- React to images/videos with funny commentary
- Remember EVERYTHING from the conversation (text, images, videos, vision data)
- Build on previous jokes and references throughout the conversation

CONVERSATION MEMORY:
- Remember all previous messages, images, videos, and vision analysis
- Reference past conversation elements in your responses
- Build running jokes and callbacks
- Acknowledge when you're seeing something new vs. referencing something old

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
              },
              ...conversationHistory,
              {
                role: 'user' as const,
                content: `I've shared an image file named "${file.name}" (${file.type}, ${Math.round(file.size / 1024)}KB). Since I cannot directly analyze the image content, could you please describe what's in the image or what you'd like help with? I'm here to assist with any questions or analysis you need.`
              }
            ],
            temperature: 0.8,
            max_tokens: 300
          });
        }
      } else {
        // For videos, use text-only model (no vision support for videos yet)
        const conversationHistory = chatMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
        }));

        aiResponse = await openai.chat.completions.create({
          model: 'grok-2-latest',
          messages: [
            {
              role: 'system' as const,
              content: `You are iSolveUrProblems, a hilariously helpful AI assistant with the personality of a witty comedian who happens to be incredibly smart. Your mission: solve problems while making people laugh out loud!

PERSONALITY TRAITS:
- Crack jokes, puns, and witty observations constantly
- Use self-deprecating humor and playful sarcasm
- Make pop culture references and clever wordplay
- Be genuinely helpful while being absolutely hilarious
- React to images/videos with funny commentary
- Remember EVERYTHING from the conversation (text, images, videos, vision data)
- Build on previous jokes and references throughout the conversation

CONVERSATION MEMORY:
- Remember all previous messages, images, videos, and vision analysis
- Reference past conversation elements in your responses
- Build running jokes and callbacks
- Acknowledge when you're seeing something new vs. referencing something old

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
            },
            ...conversationHistory,
            {
              role: 'user' as const,
              content: `I've shared a video file named "${file.name}" (${file.type}, ${Math.round(file.size / 1024)}KB). Could you please describe what's in the video or what you'd like help with? I'm here to assist with any questions or analysis you need.`
            }
          ],
          temperature: 0.8,
          max_tokens: 300
        });
      }

      const aiMessage = aiResponse.choices[0].message.content || '';
      // Add AI response to chat
      setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
      // Set avatar speech to AI message so avatar can speak it
      setAvatarSpeech(aiMessage);

      // Clear loading state
      setIsAiProcessing(false);
    } catch (error: unknown) {
      console.error('Error processing media with AI:', error);
      setIsAiProcessing(false);
      toast({
        variant: "destructive",
        title: "Error processing media",
        description: (error as Error).message,
      });
    }
  };



  // Initialize speech recognition service
  useEffect(() => {
    speechService.current = new SpeechRecognitionService(
      handleSpeechResult,
      handleSpeechError,
      handleInterimSpeech
    );

    return () => {
      if (speechService.current) {
        speechService.current.stopListening();
      }
    };
  }, [handleInterimSpeech]); // Re-initialize when handleInterimSpeech changes (when avatarSpeech changes)

  // Auto-start continuous listening when avatar is running
  useEffect(() => {
    if (isAvatarRunning && speechService.current && !isListening && !isAiProcessing) {
      console.log('Auto-starting continuous speech recognition...');
      handleStartListening();
    }
  }, [isAvatarRunning, isListening, isAiProcessing]);

  // Periodic check to ensure speech recognition stays active
  useEffect(() => {
    if (isAvatarRunning && speechService.current) {
      const checkInterval = setInterval(() => {
        if (speechService.current && !speechService.current.isActive() && !isAiProcessing) {
          console.log('Speech recognition not active, restarting...');
          speechService.current.forceRestart();
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(checkInterval);
    }
  }, [isAvatarRunning, isAiProcessing]);


  // When avatarSpeech updates, send a talk task via HeyGen API
  useEffect(() => {
    // Early exit if speech is empty or stopping
    if (!avatarSpeech || avatarSpeech.trim().length === 0 || isStoppingRef.current) {
      // Cancel any pending request when clearing speech
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }
    
    async function speak() {
      // Double-check conditions after async gap
      if (!avatarSpeech || avatarSpeech.trim().length === 0 || isStoppingRef.current) {
        return;
      }
      
      // Cancel any pending request first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      if (avatarSpeech && sessionInfo?.session_id && sessionToken && !isStoppingRef.current) {
        try {
          await sendStreamingTask(sessionToken, sessionInfo.session_id, avatarSpeech, 'repeat', abortController.signal);
          // Check again after request completes
          if (isStoppingRef.current || !avatarSpeech) {
            return;
          }
          if (greetingRef.current === avatarSpeech) {
            greetingRef.current = null;
            greetingRetryCountRef.current = 0;
          }
        } catch (err: unknown) {
          // Ignore abort errors (they're expected when stopping)
          if ((err as any)?.name === 'AbortError' || (err as any)?.code === 'ERR_CANCELED') {
            console.log('Speech task aborted');
            return;
          }
          console.error('Error sending talk task:', err);
          if (greetingRef.current === avatarSpeech && greetingRetryCountRef.current < 3 && !isStoppingRef.current) {
            greetingRetryCountRef.current += 1;
            console.log(`Retrying greeting (attempt ${greetingRetryCountRef.current}/3)...`);
            setTimeout(() => {
              if (greetingRef.current && sessionInfo?.session_id && sessionToken && !isStoppingRef.current) {
                setAvatarSpeech(greetingRef.current);
              }
            }, 2000);
          } else if (greetingRef.current === avatarSpeech) {
            console.log('Greeting failed after retries');
            greetingRef.current = null;
            greetingRetryCountRef.current = 0;
          }
        }
      }
    }

    speak();
    
    // Cleanup: abort on unmount or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [avatarSpeech, sessionInfo?.session_id, sessionToken]);

  // Bind the vision camera stream to the small overlay video when present
  useEffect(() => {
    if (visionVideoRef.current && visionCameraStream) {
      visionVideoRef.current.srcObject = visionCameraStream;
      visionVideoRef.current.onloadedmetadata = () => {
        try { if (visionVideoRef.current) { visionVideoRef.current.play(); } } catch (e) { console.debug('vision video play failed', e); }
      };
    }
  }, [visionCameraStream]);

  // Helper: compute difference ratio between two ImageData buffers (0..1)
  function computeFrameDifferenceRatio(a: ImageData, b: ImageData): number {
    const dataA = a.data;
    const dataB = b.data;
    const length = Math.min(dataA.length, dataB.length);
    let diffSum = 0;
    for (let i = 0; i < length; i += 4) {
      // Ignore alpha channel variations; compare RGB
      const dr = Math.abs(dataA[i] - dataB[i]);
      const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
      const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
      diffSum += dr + dg + db;
    }
    // Max per pixel difference is 255*3; normalize by pixels
    const pixels = length / 4;
    const maxTotal = pixels * 255 * 3;
    return diffSum / maxTotal;
  }

  // Helper: capture a downscaled frame from the vision video for fast diff
  function sampleVisionFrame(width = 96, height = 72): ImageData | null {
    if (!visionVideoRef.current) return null;
    const video = visionVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return imageData;
  }

  // Helper: capture full-quality frame DataURL for analysis
  function captureVisionFrameDataUrl(quality = 0.8): string | null {
    if (!visionVideoRef.current) return null;
    const video = visionVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    // Ensure a safe minimum pixel count to satisfy xAI Vision
    const MIN_PIXELS = 1024; // safety margin > 512
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const pixels = vw * vh;
    const scale = pixels < MIN_PIXELS ? Math.sqrt(MIN_PIXELS / Math.max(pixels, 1)) : 1;
    const cw = Math.max(2, Math.floor(vw * scale));
    const ch = Math.max(2, Math.floor(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', quality);
  }

  // Auto vision analysis: when camera view is stable for 3s, analyze automatically
  useEffect(() => {
    // Start monitoring when vision mode is on and we have a stream
    if (isVisionMode && visionCameraStream) {
      // Reset trackers
      lastSampleImageDataRef.current = null;
      stabilityStartRef.current = null;
      // throttle to at most once every 5s
      nextAllowedAnalysisAtRef.current = Date.now() + 3000;

      const intervalId = window.setInterval(() => {
        if (!visionVideoRef.current) return;
        // Avoid concurrent calls
        if (isAiProcessing) return;

        const current = sampleVisionFrame();
        if (!current) return;

        const previous = lastSampleImageDataRef.current;
        if (previous) {
          const diffRatio = computeFrameDifferenceRatio(previous, current);
          const STABILITY_DIFF_THRESHOLD = 0.05; // 5% average RGB difference
          const now = Date.now();

          if (diffRatio < STABILITY_DIFF_THRESHOLD) {
            if (stabilityStartRef.current == null) {
              stabilityStartRef.current = now;
            }
            const stableForMs = now - stabilityStartRef.current;
            if (stableForMs >= 3000 && now >= nextAllowedAnalysisAtRef.current) {
              const dataUrl = captureVisionFrameDataUrl();
              if (dataUrl) {
                // Set next allowed time to 6s later to avoid spamming
                nextAllowedAnalysisAtRef.current = now + 6000;
                handleVisionAnalysis(dataUrl);
              }
            }
          } else {
            // Movement detected, reset stability timer
            stabilityStartRef.current = null;
          }
        }

        lastSampleImageDataRef.current = current;
      }, 500); // sample twice a second

      visionMonitorIntervalRef.current = intervalId as unknown as number;

      return () => {
        if (visionMonitorIntervalRef.current) {
          clearInterval(visionMonitorIntervalRef.current);
          visionMonitorIntervalRef.current = null;
        }
      };
    }

    // Cleanup if not in vision mode
    if (visionMonitorIntervalRef.current) {
      clearInterval(visionMonitorIntervalRef.current);
      visionMonitorIntervalRef.current = null;
    }
  }, [isVisionMode, visionCameraStream, isAiProcessing]);


  // Greeting effect - fallback to play greeting if it wasn't triggered in initialization
  useEffect(() => {
    if (isAvatarRunning && sessionInfo?.session_id && sessionToken && !hasGreeted) {
      // Reduced delay fallback in case initialization didn't trigger it
      const greetingTimeout = setTimeout(() => {
        setHasGreeted(prev => {
          if (!prev) {
            const greeting = "Hello I am 6, your personal assistant. How can I help you today?";
            greetingRef.current = greeting;
            greetingRetryCountRef.current = 0;
            // Send directly via API to override any default opening text
            sendStreamingTask(sessionToken, sessionInfo.session_id, greeting, 'repeat').catch(err => {
              console.error('Failed to send fallback greeting:', err);
            });
            setAvatarSpeech(greeting);
            return true;
          }
          return prev;
        });
      }, 1500); // Reduced from 3000ms - faster fallback

      return () => clearTimeout(greetingTimeout);
    }
  }, [isAvatarRunning, sessionInfo?.session_id, sessionToken, hasGreeted]);

  // On mount: fetch token, create session, connect LiveKit, start session
  useEffect(() => {
    async function initializeAndStartAvatar() {
      try {
        setStartAvatarLoading(true);
        const response = await getAccessToken();
        const token = response.data.data.token;
        setSessionToken(token);

        const avatarId = import.meta.env.VITE_HEYGEN_AVATARID;
        const voiceId = import.meta.env.VITE_HEYGEN_VOICEID;
        if (!avatarId || !voiceId) {
          setStartAvatarLoading(false);
          toast({
            variant: "destructive",
            title: "Missing Configuration",
            description: 'Missing HeyGen environment variables. Please check VITE_HEYGEN_AVATARID and VITE_HEYGEN_VOICEID in your .env file.',
          });
          return;
        }

        // Create session via REST
        const created = await createStreamingSession(token, {
          avatar_name: avatarId,
          voice_id: voiceId,
          quality: 'high',
          video_encoding: 'H264',
        });
        setSessionInfo(created);

        // Setup LiveKit room
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution,
          },
        });
        livekitRoomRef.current = room;

        // Aggregate remote media tracks into a single MediaStream
        const combinedStream = new MediaStream();
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === 'video' || track.kind === 'audio') {
            combinedStream.addTrack(track.mediaStreamTrack);
            if (
              combinedStream.getVideoTracks().length > 0 &&
              combinedStream.getAudioTracks().length > 0
            ) {
              setStream(combinedStream);
            }
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          const mediaTrack = track.mediaStreamTrack;
          if (mediaTrack) {
            combinedStream.removeTrack(mediaTrack);
          }
        });

        // Prepare then start
        await room.prepareConnection(created.url, created.access_token);
        await startStreamingSession(token, created.session_id);
        await room.connect(created.url, created.access_token);

        setIsAvatarRunning(true);
        setStartAvatarLoading(false);

        // Send greeting IMMEDIATELY to override any default opening text
        // First interrupt any default speech, then send our greeting
        setTimeout(async () => {
          setHasGreeted(prev => {
            if (!prev) {
              const greeting = "Hello I am 6, your personal assistant. How can I help you today?";
              greetingRef.current = greeting;
              greetingRetryCountRef.current = 0;
              
              // Interrupt any default opening text first, then send our greeting
              // Use 'chat' task with minimal text to interrupt - API doesn't support 'interrupt' type
              sendStreamingTask(token, created.session_id, '.', 'repeat')
                .then(() => {
                  // After interrupt, immediately send our greeting
                  setTimeout(() => {
                    setAvatarSpeech(greeting);
                  }, 100);
                })
                .catch(err => {
                  console.error('Failed to interrupt default speech:', err);
                  // Still send greeting even if interrupt fails
                  setAvatarSpeech(greeting);
                });
              
              return true;
            }
            return prev;
          });
        }, 300); // Small delay to ensure session is ready, but fast enough to override default

      } catch (error: unknown) {
        console.error("Error initializing avatar:", error);
        setStartAvatarLoading(false);
        const errMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || (error as Error).message;
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: errMsg,
        });
      }
    }

    initializeAndStartAvatar();

    return () => {
      clearTimeout(timeout);
      try {
        livekitRoomRef.current?.disconnect();
      } catch (e) { console.debug('cleanup error', e); }
    };

  }, []);

  // SDK-specific handlers removed; LiveKit/REST flow handles media and speaking
  // stopAvatarSpeech function is defined earlier in the file (around line 230)





  // When the stream gets the data, The avatar video will gets played
  useEffect(() => {
    if (stream && mediaStream.current) {
      console.log(stream);
      console.log(mediaStream.current);
      mediaStream.current.srcObject = stream;
      mediaStream.current.muted = false;
      mediaStream.current.volume = 1.0;

      // Try to play immediately
      playVideo();

      // Also try on loadedmetadata as backup
      mediaStream.current.onloadedmetadata = () => {
        playVideo();
      };
    }
  }, [stream]);

  // Function to play video with proper error handling
  const playVideo = async () => {
    if (mediaStream.current) {
      try {
        // Try to play immediately regardless of readyState
        await mediaStream.current.play();
        console.log('Video started playing successfully');
        setVideoNeedsInteraction(false);
      } catch (error: unknown) {
        console.error('Error playing video:', error);
        type NamedError = { name?: string };
        const e = error as NamedError;
        if (e?.name === 'NotAllowedError') {
          console.log('Autoplay blocked, video will play when user interacts with the page');
          setVideoNeedsInteraction(true);
        } else if (e?.name === 'AbortError') {
          console.log('Video play was aborted, this is usually normal');
        } else {
          // For other errors, try again after a short delay
          setTimeout(() => {
            if (mediaStream.current) {
              mediaStream.current.play().catch(console.error);
            }
          }, 50);
        }
      }
    }
  };

  // Function to handle video area click for autoplay
  const handleVideoClick = async () => {
    if (videoNeedsInteraction && mediaStream.current) {
      try {
        await mediaStream.current.play();
        setVideoNeedsInteraction(false);
        console.log('Video started playing after user interaction');
      } catch (error) {
        console.error('Error playing video after interaction:', error);
      }
    }
  };

  // Show avatar test if enabled
  if (showAvatarTest) {
    return (
      <>
        <Toaster />
        <div className="min-h-screen bg-gray-100">
          <div className="fixed top-4 left-4 z-50">
            <button
              onClick={() => setShowAvatarTest(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Back to App
            </button>
          </div>
          <AvatarTest />
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <div className="min-h-screen bg-black">
        {/* Header - Fixed at top, mobile responsive */}
        <div className="fixed top-0 left-0 right-0 w-full bg-white/10 backdrop-blur-sm border-b border-white/20 z-30">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setShowAvatarTest(true)}
                className="px-3 py-1 text-xs bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
                title="Test Avatar Display"
              >
                Test Avatar
              </button>
              <div className="flex-1 text-center">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white" style={{ fontFamily: 'Bell MT, serif' }}>iSolveUrProblems – beta</h1>
                <p className="text-[11px] sm:text-xs text-white/80 mt-0.5" style={{ fontFamily: 'Bell MT, serif' }}>Everything - except Murder</p>
              </div>
              <div className="w-16"></div> {/* Spacer for centering */}
            </div>
          </div>
        </div>

        {/* Main Content Area - Full width video container */}
        <div className="w-full h-screen pt-16 sm:pt-20">
          {/* Video Container - Full screen */}
          <div className="relative w-full h-full">
            <Video
              ref={mediaStream}
              className={`opacity-100 transition-all duration-300 ${videoNeedsInteraction ? 'cursor-pointer' : ''}`}
              onClick={() => handleVideoClick()}
            />

            {/* Click to play overlay when video needs interaction */}
            {/* {videoNeedsInteraction && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm cursor-pointer z-10"
                onClick={handleVideoClick}
              >
                <div className="text-center p-6 bg-white/95 rounded-2xl shadow-2xl border border-white/20 max-w-sm mx-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Click to Start Avatar</h3>
                  <p className="text-gray-600 text-sm">Click anywhere to begin your conversation</p>
                </div>
              </div>
            )} */}
            {/* Control buttons - Paper clip and Camera buttons */}
            {(isAvatarFullScreen && isAvatarRunning) && (
              <>
                {/* Paper clip and Camera buttons - slightly above hands */}
                <div className="absolute inset-x-0 top-1/2 translate-y-8 flex justify-center gap-4 z-20">
                {/* Camera Button */}
                  <button
                    onClick={async () => {
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        setVisionCameraStream(stream);
                        setIsVisionMode(true);
                      } catch (error) {
                        console.error('Error accessing camera:', error);
                        toast({
                          variant: "destructive",
                          title: "Camera Error",
                          description: "Could not access camera. Please check permissions.",
                        });
                      }
                    }}
                    disabled={isAiProcessing}
                    className={`h-12 w-20 ${'bg-amber-700/80 border-amber-600 text-amber-100 hover:bg-amber-800/80 shadow-lg items-center justify-center'
                      }`}
                    style={{
                      borderRadius: '50px',
                      border: '4px solid #8B4513',
                      borderTop: '4px solid #8B4513',
                      borderBottom: '4px solid #8B4513',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Open vision mode'}
                  >
                    <Camera className="h-8 w-8 m-auto" />
                  </button>
                  {/* Paper Clip Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAiProcessing}
                    className={`h-12 w-20 ${'bg-amber-700/80 border-amber-600 text-amber-100 hover:bg-amber-800/80 shadow-lg items-center justify-center'
                      }`}
                    style={{
                      borderRadius: '50px',
                      border: '4px solid #8B4513',
                      borderTop: '4px solid #8B4513',
                      borderBottom: '4px solid #8B4513',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Upload images or videos'}
                  >
                    <Paperclip className="h-8 w-8 m-auto" />
                  </button>
                </div>

                {/* Hidden file input for paper clip button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

              </>
            )}
          </div>

        </div>

        {/* Avatar Control Buttons - Only show Stop button when user has started chatting */}
        {isAvatarRunning && !startAvatarLoading && hasUserStartedChatting && (
          <div className="fixed bottom-20 sm:bottom-24 left-1/2 transform -translate-x-1/2 z-30 lg:left-1/2 lg:transform-none lg:bottom-20">
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={stopAvatarSpeech}
                disabled={isStopping}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-xs sm:text-sm lg:text-base shadow-lg hover:shadow-xl backdrop-blur-sm border border-white/20 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isStopping ? (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{isStopping ? 'Stopping...' : 'Stop Talking'}</span>
                <span className="sm:hidden">{isStopping ? '...' : 'Stop'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading indicator when avatar is starting automatically */}
        {startAvatarLoading && (
          <div className="fixed bottom-20 sm:bottom-24 left-1/2 transform -translate-x-1/2 z-30 lg:left-1/2 lg:transform-none lg:bottom-20">
            <div className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg backdrop-blur-sm border border-white/20">
              <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              <span className="text-xs sm:text-sm lg:text-base">Starting Avatar...</span>
            </div>
          </div>
        )}


        {/* Vision Mode Camera - Right corner when in vision mode */}
        {isVisionMode && (
          <div className="fixed top-20 right-4 w-32 h-40 z-40 rounded-lg overflow-hidden shadow-2xl border-2 border-purple-500">
            <video
              ref={visionVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              muted
              controls={false}
            />
            <div className="absolute top-2 right-2">
              <button
                onClick={exitVisionMode}
                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition-all duration-200"
                title="Exit Vision Mode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
            <button
              onClick={() => {
                // Trigger another vision analysis
                if (mediaStream.current) {
                  const canvas = document.createElement('canvas');
                  const video = mediaStream.current;
                  const context = canvas.getContext('2d');
                  
                  if (context) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    context.drawImage(video, 0, 0);
                    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    handleVisionAnalysis(imageDataUrl);
                  }
                }
              }}
              disabled={isAiProcessing}
              className={`p-2 rounded-full shadow-lg transition-all duration-200 ${
                isAiProcessing 
                  ? 'bg-purple-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
              }`}
              title={isAiProcessing ? 'Analyzing...' : 'Analyze Again'}
            >
              {isAiProcessing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FaEye size={16} />
              )}
            </button>
          </div> */}
          </div>
        )}

      </div>
    </>
  );
}

export default App;
