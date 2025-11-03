import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from 'react';
import OpenAI from 'openai';
import { Configuration, NewSessionData, StreamingAvatarApi } from '@heygen/streaming-avatar';
import { getAccessToken } from './services/api';
import { Video } from './components/reusable/Video';
import { Toaster } from "@/components/ui/toaster";
import { Loader2, Settings } from 'lucide-react';
import { SpeechRecognitionService } from './utils/speechRecognition';
import AvatarTest from './components/reusable/AvatarTest';
import { DesignPanel } from './components/reusable/DesignPanel';

interface ChatMessageType {
  role: string;
  message: string;
  media?: {
    file: File;
    type: 'photo' | 'video';
  };
  // Optional key to link this message to a background media analysis entry
  mediaKey?: string;
};

function App() {
  //Toast
  const { toast } = useToast()

  const [isListening, setIsListening] = useState<boolean>(false);
  const [avatarSpeech, setAvatarSpeech] = useState<string>('');
  const [stream, setStream] = useState<MediaStream>();
  const [data, setData] = useState<NewSessionData>();
  const [isVisionMode, setIsVisionMode] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const visionVideoRef = useRef<HTMLVideoElement>(null);
  const [visionCameraStream, setVisionCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment'); // Default to rear-facing
  const visionMonitorIntervalRef = useRef<number | null>(null);
  const lastSampleImageDataRef = useRef<ImageData | null>(null);
  const stabilityStartRef = useRef<number | null>(null);
  const nextAllowedAnalysisAtRef = useRef<number>(0);
  const avatar = useRef<StreamingAvatarApi | null>(null);
  const speechService = useRef<SpeechRecognitionService | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Store background media analysis results keyed by a generated mediaKey
  const [mediaAnalyses, setMediaAnalyses] = useState<Record<string, {
    type: 'photo' | 'video';
    fileName: string;
    status: 'processing' | 'ready' | 'error';
    analysisText?: string;
    errorMessage?: string;
  }>>({});
  const [latestMediaKey, setLatestMediaKey] = useState<string | null>(null);
  const [isAvatarFullScreen, setIsAvatarFullScreen] = useState<boolean>(false);
  const isAvatarSpeakingRef = useRef<boolean>(false);
  const shouldCancelSpeechRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null); // Ref to always have current sessionId
  const isInitialGreetingRef = useRef<boolean>(false); // Flag to protect initial greeting from interruption
  const [hasUserStartedChatting, setHasUserStartedChatting] = useState<boolean>(false);
  const [videoNeedsInteraction, setVideoNeedsInteraction] = useState<boolean>(false);
  const [showAvatarTest, setShowAvatarTest] = useState<boolean>(false);
  const [showDesignPanel, setShowDesignPanel] = useState<boolean>(false);
  
  // Design settings for mobile buttons
  const [designSettings, setDesignSettings] = useState({
    cameraButton: {
      opacity: 1,
      color: '#f59e0b', // amber-500
      size: 48, // p-3 = 12px padding on each side, so ~48px total
      position: {
        top: 0, // translate-y-8 = 2rem from center
        left: 0
      }
    },
    paperClipButton: {
      opacity: 1,
      color: '#f59e0b', // amber-500
      size: 48,
      position: {
        top: 0,
        left: 0
      }
    },
    buttonGap: 1 // gap-4 = 1rem
  });
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
    // Reset to default rear-facing camera when exiting
    setCameraFacingMode('environment');
  };

  // Function to handle "What can you see right now?" button click
  const handleWhatCanYouSee = async () => {
    if (!visionVideoRef.current || isAiProcessing) {
      return;
    }

    try {
      setIsAiProcessing(true);
      
      // Capture current frame
      const currentFrameDataUrl = captureVisionFrameDataUrl();
      if (!currentFrameDataUrl) {
        toast({
          variant: "destructive",
          title: "Camera Error",
          description: "Could not capture camera frame. Please try again.",
        });
        setIsAiProcessing(false);
        return;
      }

      // Build conversation history
      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
      }));

      // Prepare messages for vision analysis
      const messagesForVision = [
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
- Answer questions based on what you can see in the current camera frame

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
- Answer questions based on what you see in the camera view

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
        },
        ...conversationHistory,
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: 'What can you see right now? Describe what you see in the current camera view.'
            },
            {
              type: 'image_url' as const,
              image_url: { url: currentFrameDataUrl, detail: 'high' as const }
            }
          ]
        }
      ];

      // Get AI response
      const aiResponse = await openai.chat.completions.create({
        model: 'grok-2-vision',
        messages: messagesForVision,
        temperature: 0.8,
        max_tokens: 400
      } as any);

      const aiMessage = aiResponse.choices[0].message.content || '';
      
      // Add AI response to chat
      setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
      
      // CRITICAL: Suspend speech recognition BEFORE setting avatar speech to prevent it from capturing avatar's voice
      speechService.current?.suspend();
      
      // Make avatar speak the analysis
      if (!isAvatarSpeakingRef.current) {
        setAvatarSpeech(aiMessage);
      } else {
        // Wait briefly for avatar to finish, then speak
        setTimeout(() => {
          if (!isAvatarSpeakingRef.current) {
            setAvatarSpeech(aiMessage);
          } else {
            // Force clear and set speech
            isAvatarSpeakingRef.current = false;
            setAvatarSpeech(aiMessage);
          }
        }, 300);
      }

      setIsAiProcessing(false);
    } catch (error: any) {
      console.error('Error analyzing camera view:', error);
      setIsAiProcessing(false);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: error.message || 'Failed to analyze the camera view. Please try again.',
      });
    }
  };

  // Function to switch camera facing mode
  const switchCamera = async () => {
    const newFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    
    // Stop current stream
    if (visionCameraStream) {
      visionCameraStream.getTracks().forEach(t => t.stop());
    }

    try {
      // Get new stream with the opposite facing mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode }
      });
      setVisionCameraStream(stream);
      setCameraFacingMode(newFacingMode);
    } catch (error) {
      console.error('Error switching camera:', error);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not switch camera. Please check permissions.",
      });
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
  let timeout: any;


  const apiKey: any = import.meta.env.VITE_XAI_API_KEY;
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
    
    // CRITICAL: If avatar is still speaking, interrupt it first before processing
    if (isAvatarSpeakingRef.current) {
      console.log('⚠️ Avatar still speaking when user speech received - forcing interrupt...');
      try {
        // Use sessionId from ref (always current), fallback to state, then data
        const currentSessionId = sessionIdRef.current || sessionId || data?.sessionId;
        if (avatar.current && currentSessionId) {
          console.log('📞 Force interrupting avatar with sessionId:', currentSessionId);
          await avatar.current.interrupt({
            interruptRequest: {
              sessionId: currentSessionId
            }
          });
          console.log('✅ Avatar force interrupted successfully');
        } else {
          console.warn('⚠️ Cannot force interrupt - missing sessionId', {
            hasAvatar: !!avatar.current,
            sessionIdFromRef: sessionIdRef.current,
            sessionIdFromState: sessionId,
            sessionIdFromData: data?.sessionId
          });
        }
      } catch (err) {
        console.error('Interrupt failed:', err);
      } finally {
        setAvatarSpeech('');
        isAvatarSpeakingRef.current = false;
      }
    }
    
    try {
      // Mark that user has started chatting - this means initial greeting is done
      setHasUserStartedChatting(true);
      // Clear initial greeting flag since user has started interacting
      isInitialGreetingRef.current = false;

      // Add user message to chat
      const updatedMessages = [...chatMessages, { role: 'user', message: transcript }];
      setChatMessages(updatedMessages);

      // Set loading state
      setIsAiProcessing(true);

      // Check if we're in camera/vision mode - if so, capture current frame and answer based on it
      if (isVisionMode && visionVideoRef.current) {
        console.log('📸 Camera mode active - capturing current frame for AI response');
        const currentFrameDataUrl = captureVisionFrameDataUrl();
        
        if (currentFrameDataUrl) {
          // Build conversation history for vision
          const conversationHistory = updatedMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.media ? `${msg.message} [${msg.media.type.toUpperCase()}: ${msg.media.file.name}]` : msg.message
          }));

          const messagesForVision = [
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
- Answer questions based on what you can see in the current camera frame

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
- Answer questions based on what you see in the camera view

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
            },
            ...conversationHistory.slice(0, -1), // All previous messages except the last (user's current question)
            {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: transcript
                },
                {
                  type: 'image_url' as const,
                  image_url: { url: currentFrameDataUrl, detail: 'high' as const }
                }
              ]
            }
          ];

          const aiResponse = await openai.chat.completions.create({
            model: 'grok-2-vision',
            messages: messagesForVision,
            temperature: 0.8,
            max_tokens: 400
          } as any);

          const aiMessage = aiResponse.choices[0].message.content || '';
          // Add AI response to chat
          setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
          
          // CRITICAL: After processing user speech and getting AI response, always set avatar speech
          // The speak useEffect will handle ensuring the avatar is ready to speak
          // If avatar was interrupted earlier, it should be ready now; if not, we'll wait briefly
          if (!isAvatarSpeakingRef.current) {
            // Avatar is not speaking - safe to start speaking the response immediately
            setAvatarSpeech(aiMessage);
          } else {
            // Avatar might still be in the process of stopping after interruption
            // Wait briefly for the interrupt to complete, then set speech
            console.log('⚠️ Avatar might still be stopping, waiting briefly before speaking response...');
            setTimeout(() => {
              // Double-check and set speech - the speak useEffect will handle the rest
              if (!isAvatarSpeakingRef.current) {
                setAvatarSpeech(aiMessage);
              } else {
                // Force clear and set speech - user has spoken, avatar must respond
                console.log('⚠️ Force clearing avatar speaking flag to allow response');
                isAvatarSpeakingRef.current = false;
                setAvatarSpeech(aiMessage);
              }
            }, 300);
          }

          // Clear loading state
          setIsAiProcessing(false);
          return; // Exit early since we've handled vision mode
        } else {
          console.warn('⚠️ Could not capture camera frame, falling back to text-only mode');
        }
      }

      // Get AI response using xAI with full conversation context
      // Build optional media context if latest media analysis is ready
      const mediaContextMessage = (() => {
        if (!latestMediaKey) return null;
        const analysis = mediaAnalyses[latestMediaKey];
        if (!analysis || analysis.status !== 'ready' || !analysis.analysisText) return null;
        return {
          role: 'system' as const,
          content: `Context: Recent ${analysis.type} "${analysis.fileName}" analysis is available.\n\n${analysis.analysisText}\n\nUse this when answering questions about the latest uploaded media.`
        };
      })();

      // If user asks to describe the uploaded media, use background analysis workflow
      const wantsMediaDescription = /\b(describe|what\s+is\s+in|what's\s+in|what\s+is\s+on|explain)\b.*\b(image|photo|picture|pic)\b/i.test(transcript)
        || /describe about the image/i.test(transcript);

      if (wantsMediaDescription) {
        const latest = getLatestMediaMessage();
        const mediaInfo = latest && (latest as any).media as { file: File; type: 'photo' | 'video' } | undefined;
        const fileName = mediaInfo?.file?.name || 'the uploaded file';
        const analysis = latestMediaKey ? mediaAnalyses[latestMediaKey] : undefined;

        if (!analysis || analysis.status !== 'ready' || !analysis.analysisText) {
          const waitMsg = `I'm still analyzing "${fileName}". Please wait a moment.`;
          setChatMessages(prev => [...prev, { role: 'assistant', message: waitMsg }]);
          setAvatarSpeech(waitMsg);
          setIsAiProcessing(false);
          return;
        }

        // Use stored analysis to answer
        const conversationHistory = updatedMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: (msg as any).media ? `${msg.message} [${(msg as any).media.type.toUpperCase()}: ${(msg as any).media.file.name}]` : msg.message
        }));

        const messagesForAnswer = [
          {
            role: 'system' as const,
            content: `You are iSolveUrProblems, a hilariously helpful AI assistant...`
          },
          {
            role: 'system' as const,
            content: `Context: Analysis for "${analysis.fileName}" is available.\n\n${analysis.analysisText}\n\nBase your answer on this analysis when responding to the user's request.`
          },
          ...conversationHistory,
          { role: 'user' as const, content: transcript }
        ];

        const aiResponse = await openai.chat.completions.create({
          model: 'grok-2-latest',
          messages: messagesForAnswer,
          temperature: 0.8,
          max_tokens: 400
        });

        const aiMessage = aiResponse.choices[0].message.content || '';
        setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
        setAvatarSpeech(aiMessage);
        setIsAiProcessing(false);
        return;
      }

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
          // Inject media analysis context just before conversation turns
          ...(mediaContextMessage ? [mediaContextMessage] : []),
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
        max_tokens: 400
      });

      const aiMessage = aiResponse.choices[0].message.content || '';
      // Add AI response to chat
      setChatMessages(prev => [...prev, { role: 'assistant', message: aiMessage }]);
      
      // CRITICAL: After processing user speech and getting AI response, always set avatar speech
      // The speak useEffect will handle ensuring the avatar is ready to speak
      // If avatar was interrupted earlier, it should be ready now; if not, we'll wait briefly
      if (!isAvatarSpeakingRef.current) {
        // Avatar is not speaking - safe to start speaking the response immediately
        setAvatarSpeech(aiMessage);
      } else {
        // Avatar might still be in the process of stopping after interruption
        // Wait briefly for the interrupt to complete, then set speech
        console.log('⚠️ Avatar might still be stopping, waiting briefly before speaking response...');
        setTimeout(() => {
          // Double-check and set speech - the speak useEffect will handle the rest
          if (!isAvatarSpeakingRef.current) {
            setAvatarSpeech(aiMessage);
          } else {
            // Force clear and set speech - user has spoken, avatar must respond
            console.log('⚠️ Force clearing avatar speaking flag to allow response');
            isAvatarSpeakingRef.current = false;
            setAvatarSpeech(aiMessage);
          }
        }, 300);
      }

      // Clear loading state
      setIsAiProcessing(false);
    } catch (error: any) {
      console.error('Error processing speech result:', error);
      setIsAiProcessing(false);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: error.message,
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

  // Function to handle file uploads
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      // Mark that user has started chatting
      setHasUserStartedChatting(true);

      const newFiles = Array.from(files);

      // Process each file and add to chat immediately
      newFiles.forEach(file => {
        // Detect file type more accurately
        // Check MIME type first, then fall back to extension
        let fileType: 'photo' | 'video' | null = null;
        if (file.type.startsWith('image/')) {
          fileType = 'photo';
        } else if (file.type.startsWith('video/')) {
          fileType = 'video';
        } else {
          // Fallback: check file extension
          const fileName = file.name.toLowerCase();
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
          const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
          
          if (imageExtensions.some(ext => fileName.endsWith(ext))) {
            fileType = 'photo';
          } else if (videoExtensions.some(ext => fileName.endsWith(ext))) {
            fileType = 'video';
          }
        }

        if (fileType) {
          const mediaKey = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
          // Track latest media for future context
          setLatestMediaKey(mediaKey);
          // Initialize background analysis entry
          setMediaAnalyses(prev => ({
            ...prev,
            [mediaKey]: {
              type: fileType,
              fileName: file.name,
              status: 'processing'
            }
          }));
          // Add media message to chat immediately
          const mediaMessage: ChatMessageType = {
            role: 'user',
            message: `I uploaded a ${fileType}`,
            media: { file, type: fileType },
            mediaKey
          };
          setChatMessages(prev => [...prev, mediaMessage]);

          // Analyze in background (no immediate reply)
          void processMediaWithAI(file, fileType, mediaKey);
        }
      });

      // Clear the input
      event.target.value = '';

      toast({
        title: "Upload received",
        description: `${newFiles.length} file(s) queued for analysis`,
      });

      // Inform user that analysis is underway
      const analyzingText = newFiles.length === 1
        ? `I'm analyzing right now. Please wait until Analysis is finished  ...`
        : `I'm analyzing your files now. Please wait until Analysis is finished...`;
      setChatMessages(prev => [...prev, { role: 'assistant', message: analyzingText }]);
      // CRITICAL: Suspend speech recognition BEFORE setting avatar speech to prevent it from capturing avatar's voice
      speechService.current?.suspend();
      setAvatarSpeech(analyzingText);
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

  // NOTE: Video frame capture helper removed; current flow answers video questions from stored analysis.

  // Helper to find the most relevant recent media message
  const getLatestMediaMessage = (): ChatMessageType | null => {
    // Prefer exact mediaKey match
    if (latestMediaKey) {
      const exact = [...chatMessages].reverse().find(m => (m as any).mediaKey === latestMediaKey && (m as any).media);
      if (exact) return exact as any;
    }
    // Fallback: last message that has media
    const anyMedia = [...chatMessages].reverse().find(m => (m as any).media);
    return anyMedia || null;
  };

  // Function to handle vision analysis from camera
  const handleVisionAnalysis = async (imageDataUrl: string) => {
    try {
      // Ensure we are in vision mode and throttle concurrent work
      setIsVisionMode(true);
      setIsAiProcessing(true);

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
              text: 'Analyze this camera frame. Provide concise observations and helpful context. Do not address the user; this is background analysis.'
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
        max_tokens: 400
      } as any);

      const aiMessage = aiResponse.choices[0].message.content || '';
      // Store the analysis in background; do not reply or speak until user asks
      const mediaKey = `vision_${Date.now()}`;
      setLatestMediaKey(mediaKey);
      setMediaAnalyses(prev => ({
        ...prev,
        [mediaKey]: {
          type: 'photo',
          fileName: 'camera_frame',
          status: 'ready',
          analysisText: aiMessage
        }
      }));
      setIsAiProcessing(false);

    } catch (error: any) {
      console.error('Error processing vision analysis:', error);
      setIsAiProcessing(false);
      setIsVisionMode(false); // Exit vision mode on error
      toast({
        variant: "destructive",
        title: "Vision Analysis Error",
        description: error.message || 'Failed to analyze the image. Please try again.',
      });
    }
  };

  // Receive live camera stream from CameraModal when vision starts

  // Function to process media with AI (background). Stores results instead of replying immediately
  const processMediaWithAI = async (file: File, type: 'photo' | 'video', mediaKey: string) => {
    try {
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
            max_tokens: 400
          } as any);

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
            max_tokens: 400
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
          max_tokens: 400
        });
      }
      const aiMessage = aiResponse.choices[0].message.content || '';
      // Store analysis in background store
      setMediaAnalyses(prev => ({
        ...prev,
        [mediaKey]: {
          type,
          fileName: file.name,
          status: 'ready',
          analysisText: aiMessage
        }
      }));

      // Notify user that analysis is complete for this item
      const doneText = `Perfect! I've completed analyzing your ${type === 'photo' ? 'image' : 'video'} "${file.name}" and I've got all the details locked and loaded. The analysis is finished, and I'm ready to help you with whatever you need! What questions do you have about it?`;
      setChatMessages(prev => [...prev, { role: 'assistant', message: doneText }]);
      
      // Wait a bit for any previous speech to finish, then set the completion message
      // This ensures the avatar will speak the completion message even if it's currently speaking
      setTimeout(() => {
        // Check if avatar is still speaking; if so, interrupt to speak the completion message
        if (isAvatarSpeakingRef.current && avatar.current) {
          const currentSessionId = sessionIdRef.current || sessionId;
          if (currentSessionId) {
            console.log('Interrupting current speech to deliver completion message');
            // Reset speaking state immediately so new speech isn't blocked
            isAvatarSpeakingRef.current = false;
            // Interrupt current speech to make room for completion message
            avatar.current.interrupt({
              interruptRequest: { sessionId: currentSessionId }
            }).catch(err => console.error('Interrupt error:', err));
          }
        }
        // Set the completion message after a short delay to ensure interrupt completes
        setTimeout(() => {
          console.log('Setting completion message:', doneText.substring(0, 50));
          // CRITICAL: Suspend speech recognition BEFORE setting avatar speech to prevent it from capturing avatar's voice
          speechService.current?.suspend();
          setAvatarSpeech(doneText);
        }, 400);
      }, 500);
    } catch (error: any) {
      console.error('Error processing media with AI:', error);
      setMediaAnalyses(prev => ({
        ...prev,
        [mediaKey]: {
          type,
          fileName: file.name,
          status: 'error',
          errorMessage: error?.message || 'Failed to analyze media'
        }
      }));
      toast({
        variant: "destructive",
        title: "Error processing media",
        description: error.message,
      });
    }
  };



  // Initialize speech recognition service
  useEffect(() => {
    speechService.current = new SpeechRecognitionService(
      handleSpeechResult,
      handleSpeechError,
      async () => {
        // User started speaking; if avatar is currently talking, interrupt IMMEDIATELY
        // EXCEPTION: Don't interrupt the initial greeting - let it complete
        if (isAvatarSpeakingRef.current && !isInitialGreetingRef.current) {
          console.log('🚨 User speech detected - interrupting avatar immediately...');
          
          // CRITICAL: Set cancellation flag FIRST to stop ongoing speak() function
          shouldCancelSpeechRef.current = true;
          
          // CRITICAL: Clear avatar speech state (synchronously) to prevent new speech
          setAvatarSpeech('');
          isAvatarSpeakingRef.current = false;
          
          // CRITICAL: Actually CALL and AWAIT the interrupt - don't just fire and forget
          try {
            // Use sessionId from ref (always current), fallback to state, then data
            const currentSessionId = sessionIdRef.current || sessionId || data?.sessionId;
            
            if (avatar.current && currentSessionId) {
              console.log('📞 Calling interrupt API with sessionId:', currentSessionId);
              const interruptResult = await avatar.current.interrupt({
                interruptRequest: {
                  sessionId: currentSessionId
                }
              });
              console.log('✅ Avatar interrupted successfully via API. Result:', interruptResult);
            } else {
              console.warn('⚠️ Cannot interrupt - avatar or sessionId not available', {
                hasAvatar: !!avatar.current,
                sessionIdFromRef: sessionIdRef.current,
                sessionIdFromState: sessionId,
                sessionIdFromData: data?.sessionId,
                currentSessionId
              });
            }
          } catch (err: any) {
            console.error('❌ Interrupt API call failed:', err);
            // Even if interrupt fails, we've cleared the state and set cancel flag
          }
          
          // Immediately force resume recognition so user's ongoing speech can be captured
          speechService.current?.forceResume();
        } else if (isInitialGreetingRef.current) {
          console.log('🛡️ Ignoring interrupt attempt during initial greeting');
        }
      }
    );

    return () => {
      if (speechService.current) {
        speechService.current.stopListening();
      }
    };
  }, []);

  // Auto-start continuous listening when avatar is running
  // BUT: Don't start until initial greeting is complete (to avoid interfering with greeting)
  useEffect(() => {
    if (isAvatarRunning && speechService.current && !isListening && !isAiProcessing && !isInitialGreetingRef.current) {
      console.log('Auto-starting continuous speech recognition...');
      handleStartListening();
    }
  }, [isAvatarRunning, isListening, isAiProcessing]);

  // Periodic check to ensure speech recognition stays active
  // BUT: Don't start/restart during initial greeting
  useEffect(() => {
    if (isAvatarRunning && speechService.current) {
      const checkInterval = setInterval(() => {
        // Only restart if greeting is complete
        if (speechService.current && !speechService.current.isActive() && !isAiProcessing && !isInitialGreetingRef.current) {
          console.log('Speech recognition not active, restarting...');
          speechService.current.forceRestart();
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(checkInterval);
    }
  }, [isAvatarRunning, isAiProcessing]);


  // useEffect getting triggered when the avatarSpeech state is updated, basically make the avatar to talk
  useEffect(() => {
    async function speak() {
      // Use sessionId from ref (always current) or state, for greeting compatibility
      const currentSessionId = sessionIdRef.current || sessionId;
      if (avatarSpeech && currentSessionId) {
        // CRITICAL: Reset cancellation flag at start of new speech
        shouldCancelSpeechRef.current = false;
        
        // CRITICAL: Check if user is currently speaking (AI processing means user just spoke)
        // Don't start speaking if user is in the middle of speaking
        if (isAiProcessing) {
          console.log('⚠️ Skipping avatar speech - user is speaking (AI processing)');
          // Clear the avatarSpeech since we're not speaking it
          setAvatarSpeech('');
          return;
        }
        
        // CRITICAL: Double-check avatar is not already speaking (race condition protection)
        if (isAvatarSpeakingRef.current) {
          console.log('⚠️ Skipping avatar speech - avatar already speaking');
          setAvatarSpeech('');
          return;
        }
        
        try {
          // Suspend speech recognition while avatar is speaking to avoid self-capture
          speechService.current?.suspend();
          isAvatarSpeakingRef.current = true;
          console.log('🗣️ Avatar starting to speak:', avatarSpeech.substring(0, 50) + '...');
          
          // Store the current avatarSpeech value to check if it was cleared during speak
          const speechToSpeak = avatarSpeech;
          
          // Call speak API
          // Note: If interrupted, the server will stop but the promise may still resolve
          // The handleAvatarStopTalking event will handle cleanup
          const speakPromise = avatar.current?.speak({ taskRequest: { text: speechToSpeak, sessionId: currentSessionId } });
          await speakPromise;
          
          // CRITICAL: After speak completes, check if it was cancelled/interrupted
          // (The interrupt might have happened during speak, and handleAvatarStopTalking 
          // would have already set isAvatarSpeakingRef.current = false)
          if (shouldCancelSpeechRef.current || !isAvatarSpeakingRef.current) {
            console.log('⚠️ Speech was cancelled/interrupted - speak() completed but was interrupted');
            // Clear initial greeting flag if it was interrupted
            if (isInitialGreetingRef.current) {
              isInitialGreetingRef.current = false;
            }
            // Don't update state - handleAvatarStopTalking already did it
            return;
          }
          
          // If this was the initial greeting, clear the flag now that it's complete
          if (isInitialGreetingRef.current) {
            console.log('✅ Initial greeting completed successfully');
            isInitialGreetingRef.current = false;
          }
          
          console.log('✅ Avatar finished speaking naturally (not interrupted)');
        } catch (err: any) {
          console.error('Speak failed:', err);
          // If speak fails, reset speaking state
          isAvatarSpeakingRef.current = false;
          speechService.current?.resume();
        } finally {
          // Only reset speaking state if we weren't cancelled
          if (!shouldCancelSpeechRef.current && isAvatarSpeakingRef.current) {
            // State will be set by handleAvatarStopTalking event
          }
        }
      }
    }

    speak();
  }, [avatarSpeech, sessionId, isAiProcessing]);

  // Bind the vision camera stream to the small overlay video when present
  useEffect(() => {
    if (visionVideoRef.current && visionCameraStream) {
      visionVideoRef.current.srcObject = visionCameraStream;
      visionVideoRef.current.onloadedmetadata = () => {
        try { visionVideoRef.current && visionVideoRef.current.play(); } catch { }
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


  // useEffect called when the component mounts, to fetch the accessToken and automatically start the avatar
  useEffect(() => {
    async function initializeAndStartAvatar() {
      try {
        const response = await getAccessToken();
        const token = response.data.data.token;

        if (!avatar.current) {
          avatar.current = new StreamingAvatarApi(
            new Configuration({
              accessToken: token,
              basePath: '/api/heygen'
            })
          );
        }
        console.log(avatar.current)
        // Clear any existing event handlers to prevent duplication
        avatar.current.removeEventHandler("avatar_stop_talking", handleAvatarStopTalking);
        avatar.current.addEventHandler("avatar_stop_talking", handleAvatarStopTalking);

        // Automatically start the avatar
        await startAvatar();

      } catch (error: any) {
        console.error("Error initializing avatar:", error);
        toast({
          variant: "destructive",
          title: "Uh oh! Something went wrong.",
          description: error.response.data.message || error.message,
        })
      }
    }

    initializeAndStartAvatar();

    return () => {
      // Cleanup event handler and timeout
      if (avatar.current) {
        avatar.current.removeEventHandler("avatar_stop_talking", handleAvatarStopTalking);
      }
      clearTimeout(timeout);
    }

  }, []);

  // Avatar stop talking event handler
  const handleAvatarStopTalking = (e: any) => {
    console.log("Avatar stopped talking", e);
    
    // Check if this stop was due to interruption
    if (shouldCancelSpeechRef.current) {
      console.log('🛑 Avatar stopped due to user interruption');
      shouldCancelSpeechRef.current = false; // Reset flag
      // If interrupted, clear initial greeting flag (user spoke, greeting is done)
      if (isInitialGreetingRef.current) {
        isInitialGreetingRef.current = false;
      }
      
      // CRITICAL: If user interrupted and continued speaking, process their speech now
      // This ensures accumulated text gets processed even if recognition is still active
      setTimeout(() => {
        if (speechService.current) {
          speechService.current.processPendingSpeech();
        }
      }, 300); // Small delay to ensure interruption is complete
    } else if (isInitialGreetingRef.current) {
      // Greeting completed naturally
      console.log('✅ Initial greeting completed naturally');
      isInitialGreetingRef.current = false;
      // Start speech recognition now that greeting is complete
      setTimeout(() => {
        if (isAvatarRunning && speechService.current && !isListening && !isAiProcessing) {
          console.log('Starting speech recognition after greeting completion...');
          handleStartListening();
        }
      }, 500);
    }
    
    isAvatarSpeakingRef.current = false;
    // Resume recognition after a short delay to avoid capturing tail of TTS
    // But only if greeting is complete
    if (!isInitialGreetingRef.current) {
      setTimeout(() => {
        if (!isAiProcessing) {
          speechService.current?.resume();
        }
      }, 600);
    }
  };


  // Function to start the avatar (extracted from grab function)
  async function startAvatar() {
    setStartAvatarLoading(true);
    setIsAvatarFullScreen(true);

    // Check if required environment variables are present
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

    try {
      // Add error handling for the streaming API
      const res = await avatar.current!.createStartAvatar(
        {
          newSessionRequest: {
            quality: "high",
            avatarName: avatarId,
            voice: { voiceId: voiceId }
          }
        },
      );
      console.log('Avatar session created:', res);
      // Extract and store sessionId defensively from various possible shapes
      const newSessionId = (res as any)?.sessionId || (res as any)?.data?.sessionId || (res as any)?.session_id || null;
      if (newSessionId) {
        setSessionId(newSessionId);
        sessionIdRef.current = newSessionId; // Also update ref for callback access
        console.log('✅ SessionId set:', newSessionId);
      } else {
        console.warn('No sessionId found in start response:', res);
      }

      // Set up the media stream with proper error handling
      if (avatar.current?.mediaStream) {
        setData(res);
        setStream(avatar.current.mediaStream);
        setStartAvatarLoading(false);
        setIsAvatarRunning(true);
        // Greet the user after stream and session are ready
        setTimeout(() => {
          if (sessionId || newSessionId) {
            // CRITICAL: Suspend speech recognition before greeting to prevent it from capturing avatar's voice
            if (speechService.current) {
              console.log('Suspending speech recognition before greeting...');
              speechService.current.suspend();
            }
            // Mark this as initial greeting to protect it from interruption
            isInitialGreetingRef.current = true;
            console.log('👋 Starting initial greeting...');
            setAvatarSpeech('Hello, I am 6, your personal assistant. How can I help you today?');
          }
        }, 1500);
        console.log('Avatar started successfully');

        // Try to play immediately after a micro delay to ensure DOM is updated
        setTimeout(() => {
          playVideo();
        }, 10);
      } else {
        throw new Error('Media stream not available');
      }

    } catch (error: any) {
      console.error('Error starting avatar:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        avatarId: avatarId,
        voiceId: voiceId
      });
      setStartAvatarLoading(false);

      let errorMessage = 'Failed to start avatar. Please check your HeyGen configuration.';
      if (error.response?.status === 400) {
        errorMessage = 'Invalid avatar or voice configuration. Please check your HeyGen avatar and voice IDs.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid HeyGen API key. Please check your authentication.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Avatar or voice not found. Please check your HeyGen configuration.';
      } else if (error.message?.includes('debugStream')) {
        errorMessage = 'Streaming connection error. Please try refreshing the page.';
      }

      toast({
        variant: "destructive",
        title: "Error starting avatar",
        description: errorMessage,
      })
    }
  }



  // Function to stop the avatar's speech
  const stopAvatarSpeech = async () => {
    try {
      // Use sessionId from ref (always current), fallback to state, then data
      const currentSessionId = sessionIdRef.current || sessionId || data?.sessionId;
      if (avatar.current && currentSessionId) {
        // Use the interrupt method to stop current speech without ending the session
        await avatar.current.interrupt({
          interruptRequest: {
            sessionId: currentSessionId
          }
        });

        // Clear the speech text
        setAvatarSpeech('');

        toast({
          title: "Speech Stopped",
          description: "Avatar has stopped talking",
        });
      } else {
        // If no active session, just clear the speech text
        setAvatarSpeech('');
        toast({
          title: "Speech Stopped",
          description: "Avatar has stopped talking",
        });
      }
    } catch (error) {
      console.error('Error stopping avatar speech:', error);
      // Even if API call fails, clear the speech text
      setAvatarSpeech('');
      toast({
        title: "Speech Stopped",
        description: "Avatar has stopped talking",
      });
    }
  };

  // (barge-in handled inline in speech start callback)





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
      } catch (error: any) {
        console.error('Error playing video:', error);
        if (error.name === 'NotAllowedError') {
          console.log('Autoplay blocked, video will play when user interacts with the page');
          setVideoNeedsInteraction(true);
        } else if (error.name === 'AbortError') {
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
              
              <div className="flex-1 text-center">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white" style={{ fontFamily: 'Bell MT, serif' }}>iSolveUrProblems – beta</h1>
                <p className="text-[11px] sm:text-xs text-white/80 mt-0.5" style={{ fontFamily: 'Bell MT, serif' }}>Everything - except Murder</p>
              </div>
              <button
                onClick={() => setShowDesignPanel(true)}
                className="px-3 py-1 text-xs bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center gap-1"
                title="Design Panel"
              >
                <Settings className="w-3 h-3" />
                <span className="hidden sm:inline">Design</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area - Full width video container */}
        <div className="w-full h-screen pt-16 sm:pt-20">
          {/* Video Container - Full screen */}
          <div className="relative w-full h-full">
            <Video
              ref={mediaStream}
              className={
                `opacity-100 transition-all duration-300 ${videoNeedsInteraction ? 'cursor-pointer' : ''} ` +
                (isVisionMode
                  ? 'fixed top-2 left-2 sm:top-4 sm:left-4 w-20 h-28 sm:w-24 sm:h-32 z-50 rounded-lg overflow-hidden border-2 border-white/30 shadow-2xl'
                  : '')
              }
              onClick={() => handleVideoClick()}
            />

            {/* Click to play overlay when video needs interaction */}

            {/* Start Chat indicator removed per requirements */}


            {/* Control buttons - visible after session starts (avatar running) */}
            {(isAvatarFullScreen && isAvatarRunning) && (
              <>
                {/* Paper clip and Camera buttons - adjustable design */}
                <div 
                  className="absolute inset-x-0 top-1/2 z-20 flex justify-center"
                  style={{
                    transform: `translateY(${2 + designSettings.cameraButton.position.top}rem)`,
                    gap: `${designSettings.buttonGap}rem`
                  }}
                >
                  {/* Camera Button */}
                  <button
                    onClick={async () => {
                      try {
                        // Default to rear-facing camera (environment)
                        const stream = await navigator.mediaDevices.getUserMedia({
                          video: { facingMode: 'environment' }
                        });
                        setVisionCameraStream(stream);
                        setCameraFacingMode('environment'); // Reset to rear-facing when opening
                        setIsVisionMode(true);
                      } catch (error) {
                        console.error('Error accessing camera:', error);
                        // Fallback to front-facing if rear-facing fails
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'user' }
                          });
                          setVisionCameraStream(stream);
                          setCameraFacingMode('user');
                          setIsVisionMode(true);
                        } catch (fallbackError) {
                          console.error('Error accessing camera (fallback):', fallbackError);
                          toast({
                            variant: "destructive",
                            title: "Camera Error",
                            description: "Could not access camera. Please check permissions.",
                          });
                        }
                      }
                    }}
                    disabled={isAiProcessing}
                    className="rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl border border-white/20"
                    style={{
                      opacity: designSettings.cameraButton.opacity,
                      backgroundColor: designSettings.cameraButton.color,
                      width: `${designSettings.cameraButton.size}px`,
                      height: `${designSettings.cameraButton.size}px`,
                      padding: `${(designSettings.cameraButton.size - 20) / 2}px`,
                      transform: `translate(${designSettings.cameraButton.position.left}rem, 0)`
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Open vision mode'}
                  >
                    <svg 
                      className="text-gray-700" 
                      style={{ width: '20px', height: '20px' }}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>

                  {/* Paper Clip Button */}
                  <button
                    onClick={() => {
                      // On mobile, iOS may block video recording if there's an active camera stream
                      // (thinking it's an active call). We need to stop any active camera streams
                      // before opening the file picker to allow video recording.
                      if (visionCameraStream) {
                        // Temporarily stop vision camera stream to allow video recording
                        visionCameraStream.getTracks().forEach(t => t.stop());
                        setVisionCameraStream(null);
                        // Exit vision mode if active
                        setIsVisionMode(false);
                      }
                      // Small delay to ensure streams are fully stopped before opening picker
                      setTimeout(() => {
                        fileInputRef.current?.click();
                      }, 100);
                    }}
                    disabled={isAiProcessing}
                    className="rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl border border-white/20"
                    style={{
                      opacity: designSettings.paperClipButton.opacity,
                      backgroundColor: designSettings.paperClipButton.color,
                      width: `${designSettings.paperClipButton.size}px`,
                      height: `${designSettings.paperClipButton.size}px`,
                      padding: `${(designSettings.paperClipButton.size - 20) / 2}px`,
                      transform: `translate(${designSettings.paperClipButton.position.left}rem, 0)`
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Upload images or videos'}
                  >
                    <svg 
                      className="text-gray-700" 
                      style={{ width: '20px', height: '20px' }}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                </div>

                {/* Test Control Panel - appears when image is uploaded */}
                {latestMediaKey && mediaAnalyses[latestMediaKey]?.status === 'ready' && (
                  <div className="absolute inset-x-0 top-1/2 translate-y-24 flex justify-center z-20">
                    <div className="bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-2xl border border-white/30 max-w-md w-full mx-4">
                      <div className="text-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-800">Test Image Questions</h3>
                        <p className="text-xs text-gray-600 mt-1">Quick test buttons for paper clip</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            if (!isAiProcessing) {
                              handleSpeechResult('describe about the image');
                            }
                          }}
                          disabled={isAiProcessing}
                          className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg text-sm"
                        >
                          Describe about the image
                        </button>
                        <button
                          onClick={() => {
                            if (!isAiProcessing) {
                              handleSpeechResult('what can you see in the image');
                            }
                          }}
                          disabled={isAiProcessing}
                          className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg text-sm"
                        >
                          What can you see in the image
                        </button>
                        <button
                          onClick={() => {
                            if (!isAiProcessing) {
                              handleSpeechResult('what is the main thing in the image');
                            }
                          }}
                          disabled={isAiProcessing}
                          className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg text-sm"
                        >
                          What is the main thing in the image
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                                    {/* Hidden file inputs for paper clip button */}
                {/* General file input for photo library and file selection */}
                {/* Note: On mobile, this shows native picker with options: Photo Library, Take Photo or Video, Choose Files */}
                {/* Issue: When user selects "Take Photo or Video" → "Video", it might default to photo mode on some devices */}
                {/* Fix: Remove 'multiple' for video recording compatibility and ensure proper video MIME type handling */}
                <input
                  ref={fileInputRef}
                  type="file"
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
                className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-xs sm:text-sm lg:text-base shadow-lg hover:shadow-xl backdrop-blur-sm border border-white/20"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                </svg>
                <span className="hidden sm:inline">Stop Talking</span>
                <span className="sm:hidden">Stop</span>
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


        {/* Vision Mode Camera - Fullscreen when in vision mode */}
        {isVisionMode && (
          <div className="fixed inset-0 z-40 bg-black">
            <video
              ref={visionVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              muted
              controls={false}
            />
            <div className="absolute top-4 right-4 flex gap-2">
              {/* Camera Switch Button */}
              <button
                onClick={switchCamera}
                className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg transition-all duration-200"
                title={cameraFacingMode === 'environment' ? 'Switch to selfie mode' : 'Switch to rear camera'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
              {/* Exit Button */}
              <button
                onClick={exitVisionMode}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-all duration-200"
                title="Exit Vision Mode"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* What can you see button - Bottom center */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <button
                onClick={handleWhatCanYouSee}
                disabled={isAiProcessing}
                className={`px-6 py-3 rounded-full shadow-lg transition-all duration-200 font-semibold text-sm sm:text-base ${
                  isAiProcessing 
                    ? 'bg-purple-400 cursor-not-allowed text-white' 
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                }`}
                title={isAiProcessing ? 'Analyzing...' : 'What can you see right now?'}
              >
                {isAiProcessing ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </div>
                ) : (
                  'What can you see right now?'
                )}
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

        {/* Design Panel */}
        <DesignPanel
          isOpen={showDesignPanel}
          onClose={() => setShowDesignPanel(false)}
          settings={designSettings}
          onSettingsChange={setDesignSettings}
        />

      </div>
    </>
  );
}

export default App;


