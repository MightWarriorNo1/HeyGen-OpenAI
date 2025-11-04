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
  const [, setData] = useState<NewSessionData>();
  const [isVisionMode, setIsVisionMode] = useState<boolean>(false);
  const isVisionModeRef = useRef<boolean>(false); // Ref to always have current isVisionMode
  const [sessionId, setSessionId] = useState<string | null>(null);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const visionVideoRef = useRef<HTMLVideoElement>(null);
  const [visionCameraStream, setVisionCameraStream] = useState<MediaStream | null>(null);
  const visionCameraStreamRef = useRef<MediaStream | null>(null); // Ref to always have current visionCameraStream
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment'); // Default to rear-facing
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
  const latestMediaKeyRef = useRef<string | null>(null); // Ref to always have current latestMediaKey
  const mediaAnalysesRef = useRef<Record<string, {
    type: 'photo' | 'video';
    fileName: string;
    status: 'processing' | 'ready' | 'error';
    analysisText?: string;
    errorMessage?: string;
  }>>({}); // Ref to always have current mediaAnalyses
  const [isAvatarFullScreen, setIsAvatarFullScreen] = useState<boolean>(false);
  const isAvatarSpeakingRef = useRef<boolean>(false);
  const shouldCancelSpeechRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null); // Ref to always have current sessionId
  const isInitialGreetingRef = useRef<boolean>(false); // Flag to protect initial greeting from interruption
  const dataRef = useRef<NewSessionData | undefined>(undefined); // Ref to always have current data for sessionId fallback
  const isProcessingSpeechRef = useRef<boolean>(false); // Ref to track if we're currently processing speech (prevents duplicate API calls)
  const [, setHasUserStartedChatting] = useState<boolean>(false);
  const [videoNeedsInteraction, setVideoNeedsInteraction] = useState<boolean>(false);
  const [showAvatarTest, setShowAvatarTest] = useState<boolean>(false);
  const [showDesignPanel, setShowDesignPanel] = useState<boolean>(false);
  
  // Design settings for mobile buttons
  const [designSettings, setDesignSettings] = useState({
    cameraButton: {
      opacity: 1,
      color: '#BC7300',
      size: 48, // p-3 = 12px padding on each side, so ~48px total
      position: {
        top: 0, // translate-y-8 = 2rem from center
        left: 0
      }
    },
    paperClipButton: {
      opacity: 1,
      color: '#BC7300',
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
    isVisionModeRef.current = false; // Also update ref
    // do not stop avatar; just remove overlay and release camera if it was owned by modal
    if (visionCameraStream) {
      visionCameraStream.getTracks().forEach(t => t.stop());
      setVisionCameraStream(null);
      visionCameraStreamRef.current = null; // Also update ref
    }
    // Reset to default rear-facing camera when exiting
    setCameraFacingMode('environment');
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
      visionCameraStreamRef.current = stream; // Also update ref
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
      visionCameraStreamRef.current = visionCameraStream; // Also update ref
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
    
    // CRITICAL: Prevent duplicate processing if we're already processing a speech result
    // This prevents multiple API calls when multiple speech recognition results arrive quickly
    if (isProcessingSpeechRef.current || isAiProcessing) {
      console.log('⚠️ Skipping speech result - already processing another speech result');
      return;
    }
    
    // CRITICAL: Set processing flag immediately (synchronously) to prevent duplicate calls
    isProcessingSpeechRef.current = true;
    
    // CRITICAL: If avatar is still speaking, interrupt it first before processing
    if (isAvatarSpeakingRef.current) {
      console.log('⚠️ Avatar still speaking when user speech received - forcing interrupt...');
      try {
        // Use sessionId from ref (always current), fallback to ref data, then state
        const currentSessionId = sessionIdRef.current || dataRef.current?.sessionId || sessionId;
        if (avatar.current && currentSessionId) {
          console.log('📞 Force interrupting avatar with sessionId:', currentSessionId);
          // Set cancellation flag and clear state immediately
          shouldCancelSpeechRef.current = true;
          setAvatarSpeech('');
          isAvatarSpeakingRef.current = false;
          
          // Call interrupt API
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
            sessionIdFromDataRef: dataRef.current?.sessionId,
            sessionIdFromState: sessionId
          });
          // Even without sessionId, clear the state
          setAvatarSpeech('');
          isAvatarSpeakingRef.current = false;
        }
      } catch (err) {
        console.error('Interrupt failed:', err);
        // Even if interrupt fails, clear the state
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

      // CRITICAL: Camera mode takes priority - when active, always capture and include current frame
      // 1. Check if camera vision mode is explicitly active (isVisionMode state) - HIGHEST PRIORITY
      // 2. Check if user is asking about uploaded media (has latestMediaKey and analysis ready)
      // These can work together - camera frame can be included even when asking about uploaded media

      // Priority 1: If camera vision mode is explicitly active, ALWAYS capture and include current frame
      // This ensures that whenever the user asks something in camera mode, the current frame is included
      // CRITICAL: Use ref to get latest value (state might be stale in closure)
      // Also check if camera stream/video is actually active as a fallback
      const currentIsVisionMode = isVisionModeRef.current || isVisionMode;
      const currentVisionCameraStream = visionCameraStreamRef.current || visionCameraStream;
      const hasActiveCameraStream = currentVisionCameraStream && 
        currentVisionCameraStream.getTracks().some(track => track.readyState === 'live');
      const hasActiveVideo = visionVideoRef.current && 
        visionVideoRef.current.videoWidth > 0 && 
        visionVideoRef.current.videoHeight > 0;
      
      // Check if camera mode is active (either by state or by active camera stream)
      if (currentIsVisionMode || (hasActiveCameraStream && hasActiveVideo)) {
        console.log('📸 Camera mode detected:', {
          isVisionMode: currentIsVisionMode,
          hasActiveCameraStream,
          hasActiveVideo,
          videoWidth: visionVideoRef.current?.videoWidth,
          videoHeight: visionVideoRef.current?.videoHeight
        });
        // Wait a bit for video to be ready if dimensions are not available yet
        let retryCount = 0;
        const maxRetries = 10;
        let hasActiveCameraView = visionVideoRef.current && 
          visionVideoRef.current.videoWidth > 0 && 
          visionVideoRef.current.videoHeight > 0;
        
        // If camera view not ready, wait a bit and retry
        while (!hasActiveCameraView && retryCount < maxRetries && visionVideoRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
          hasActiveCameraView = visionVideoRef.current && 
            visionVideoRef.current.videoWidth > 0 && 
            visionVideoRef.current.videoHeight > 0;
          retryCount++;
        }
        
        if (hasActiveCameraView && visionVideoRef.current) {
          console.log('📸 Camera vision mode active - capturing current frame for AI response');
          const currentFrameDataUrl = captureVisionFrameDataUrl();
          console.log('📸 Frame capture result:', currentFrameDataUrl ? 'SUCCESS' : 'FAILED');
          
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
- The user is in camera mode, so you are seeing a live view from their camera

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
- Since you're in camera mode, reference what you see in the current frame

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
            
            // CRITICAL: Suspend speech recognition BEFORE setting avatar speech
            speechService.current?.suspend(aiMessage);
            
            // CRITICAL: Clear loading state FIRST, then set avatar speech
            setIsAiProcessing(false);
            
            if (!isAvatarSpeakingRef.current) {
              setAvatarSpeech(aiMessage);
            } else {
              setTimeout(() => {
                if (!isAvatarSpeakingRef.current) {
                  setAvatarSpeech(aiMessage);
                } else {
                  isAvatarSpeakingRef.current = false;
                  setAvatarSpeech(aiMessage);
                }
              }, 300);
            }
            return;
          } else {
            console.error('⚠️ Could not capture camera frame in vision mode');
            toast({
              variant: "destructive",
              title: "Camera Error",
              description: "Could not capture camera frame. Please ensure the camera is active and try again.",
            });
            setIsAiProcessing(false);
            return;
          }
        } else {
          // Camera mode is active but video not ready
          console.error('⚠️ Camera mode active but video not ready');
          toast({
            variant: "destructive",
            title: "Camera Not Ready",
            description: "Camera is not ready yet. Please wait a moment and try again.",
          });
          setIsAiProcessing(false);
          return;
        }
      }

      // Priority 2: If asking about uploaded media, use media context
      // This ensures uploaded media questions are answered from stored analysis
      // CRITICAL: Use refs to get latest values (state might be stale in closure)
      const currentLatestMediaKey = latestMediaKeyRef.current || latestMediaKey;
      const currentMediaAnalyses = mediaAnalysesRef.current;
      const hasUploadedMedia = currentLatestMediaKey && currentMediaAnalyses[currentLatestMediaKey]?.status === 'ready';
      // Improved pattern matching to catch various ways of asking about images/videos
      const isAskingAboutUploadedMedia = hasUploadedMedia && (
        // Pattern 1: "tell me about [image/photo/picture]" or "tell me about the [image/photo]"
        /tell\s+(me\s+)?(about\s+)?(the\s+)?(image|photo|picture|pic|uploaded|file|video|media)/i.test(transcript)
        // Pattern 2: "describe [image/photo]" or "what's in [image/photo]"
        || /\b(describe|what\s+is\s+in|what's\s+in|what\s+is\s+on|explain|what\s+can\s+you\s+see)\b.*\b(image|photo|picture|pic|uploaded|file|video|media)\b/i.test(transcript)
        // Pattern 3: "describe about the image" or "what about the image"
        || /(describe|what|tell|talk|say)\s+(about|of)\s+(the\s+)?(image|photo|picture|pic|file|video)/i.test(transcript)
        // Pattern 4: "what [image/photo]" or "what about [image/photo]"
        || /what\s+(about\s+)?(the\s+)?(image|photo|picture|pic|file|video)/i.test(transcript)
        // Pattern 5: Direct references like "the image", "the photo" when context suggests it's about uploaded media
        || /(the\s+)?(image|photo|picture|pic|file|video)\s+(is|shows|has|contains|depicts)/i.test(transcript)
      );

      console.log('🔍 Checking workflow:', { 
        isVisionMode: currentIsVisionMode,
        isVisionModeFromState: isVisionMode,
        isVisionModeFromRef: isVisionModeRef.current,
        hasActiveCameraStream,
        hasActiveVideo,
        hasUploadedMedia,
        isAskingAboutUploadedMedia,
        latestMediaKey: currentLatestMediaKey,
        latestMediaKeyFromState: latestMediaKey,
        latestMediaKeyFromRef: latestMediaKeyRef.current,
        mediaAnalysesKeys: Object.keys(currentMediaAnalyses),
        transcript 
      });

      // Priority 2: If asking about uploaded media, use media context
      // This ensures uploaded media questions are always answered from stored analysis
      if (isAskingAboutUploadedMedia) {
        console.log('📎 Using uploaded media context for question');
        const latest = getLatestMediaMessage();
        const mediaInfo = latest && (latest as any).media as { file: File; type: 'photo' | 'video' } | undefined;
        const fileName = mediaInfo?.file?.name || 'the uploaded file';
        const analysis = currentLatestMediaKey ? currentMediaAnalyses[currentLatestMediaKey] : undefined;

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
          {
            role: 'system' as const,
            content: `CRITICAL CONTEXT: The user has uploaded a ${analysis.type} file named "${analysis.fileName}" which has been fully analyzed.

ANALYSIS OF THE UPLOADED ${analysis.type.toUpperCase()}:
${analysis.analysisText}

INSTRUCTIONS:
- The user is asking about this uploaded ${analysis.type} file
- Base your answer ENTIRELY on the analysis provided above
- Reference specific details from the analysis in your response
- When the user says "the image", "the photo", "the picture", "the file", or "the video", they are referring to this uploaded file: "${analysis.fileName}"
- Be helpful and funny while answering their question about "${analysis.fileName}"
- DO NOT give generic responses - use the analysis content to provide specific, detailed answers`
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
        
        // CRITICAL: Suspend speech recognition BEFORE setting avatar speech
        speechService.current?.suspend(aiMessage);
        
        // CRITICAL: Clear loading state FIRST, then set avatar speech
        setIsAiProcessing(false);
        
        if (!isAvatarSpeakingRef.current) {
          setAvatarSpeech(aiMessage);
        } else {
          setTimeout(() => {
            if (!isAvatarSpeakingRef.current) {
              setAvatarSpeech(aiMessage);
            } else {
              isAvatarSpeakingRef.current = false;
              setAvatarSpeech(aiMessage);
            }
          }, 300);
        }
        return;
      }


      // Priority 3: Regular conversation - ALWAYS include media context if available
      // This ensures the AI remembers uploaded media in ALL conversations, not just when explicitly asked
      const mediaContextMessage = (() => {
        // CRITICAL: Use refs to get latest values (state might be stale in closure)
        const currentLatestMediaKey = latestMediaKeyRef.current || latestMediaKey;
        const currentMediaAnalyses = mediaAnalysesRef.current;
        if (!currentLatestMediaKey) return null;
        const analysis = currentMediaAnalyses[currentLatestMediaKey];
        if (!analysis || analysis.status !== 'ready' || !analysis.analysisText) return null;
        return {
          role: 'system' as const,
          content: `IMPORTANT: The user has uploaded a ${analysis.type} file named "${analysis.fileName}" which has been analyzed.

ANALYSIS OF THE UPLOADED ${analysis.type.toUpperCase()}:
${analysis.analysisText}

REMEMBER:
- When the user mentions "the image", "the photo", "the picture", "the file", "the video", or "the uploaded media", they are referring to this file: "${analysis.fileName}"
- Always remember this context throughout the conversation
- Reference this analysis when answering questions that might relate to the uploaded media
- If the user asks about "the image" or "the photo" without being specific, they mean this uploaded file: "${analysis.fileName}"`
        };
      })();

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
${(() => {
          const currentLatestMediaKey = latestMediaKeyRef.current || latestMediaKey;
          const currentMediaAnalyses = mediaAnalysesRef.current;
          const hasMedia = currentLatestMediaKey && currentMediaAnalyses[currentLatestMediaKey]?.status === 'ready';
          return hasMedia && currentLatestMediaKey ? `- IMPORTANT: The user has uploaded a ${currentMediaAnalyses[currentLatestMediaKey].type} file that has been analyzed. When they mention "the image", "the photo", "the picture", "the file", or "the video", they are referring to this uploaded file. Always keep this in mind when responding.` : '';
        })()}

RESPONSE STYLE:
- Start responses with a funny observation or joke when appropriate
- Use emojis sparingly but effectively for comedic timing
- Vary your humor style (puns, observational comedy, absurdist humor)
- Keep responses helpful but entertaining
- If someone shares media, react with humor while being genuinely helpful

Remember: You're not just solving problems, you're putting on a comedy show while being genuinely useful!`
          },
          // CRITICAL: ALWAYS inject media analysis context if available - this ensures the AI remembers uploaded media
          // This is included in ALL requests, not just when explicitly asking about media
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
      
      // CRITICAL: Suspend speech recognition BEFORE setting avatar speech to prevent it from capturing avatar's voice
      speechService.current?.suspend(aiMessage);
      
      // CRITICAL: Clear loading state FIRST, then set avatar speech
      // This ensures the speak useEffect can immediately process the avatar speech
      setIsAiProcessing(false);
      
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
    } catch (error: any) {
      console.error('Error processing speech result:', error);
      setIsAiProcessing(false);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: error.message,
      });
    } finally {
      // CRITICAL: Always clear processing flag, even if there was an error
      isProcessingSpeechRef.current = false;
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
          latestMediaKeyRef.current = mediaKey; // Also update ref
          // Initialize background analysis entry
          setMediaAnalyses(prev => {
            const updated = {
              ...prev,
              [mediaKey]: {
                type: fileType,
                fileName: file.name,
                status: 'processing' as const
              }
            };
            mediaAnalysesRef.current = updated; // Also update ref
            return updated;
          });
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
      speechService.current?.suspend(analyzingText);
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
      setMediaAnalyses(prev => {
        const updated = {
          ...prev,
          [mediaKey]: {
            type,
            fileName: file.name,
            status: 'ready' as const,
            analysisText: aiMessage
          }
        };
        mediaAnalysesRef.current = updated; // Also update ref
        return updated;
      });

      // Notify user that analysis is complete for this item
      const doneText = `Perfect! I've completed analyzing your ${type === 'photo' ? 'image' : 'video'} "${file.name}" and I've got all the details locked and loaded. I'm ready to help you with whatever you need! What questions do you have about it?`;
      setChatMessages(prev => [...prev, { role: 'assistant', message: doneText }]);
      
      // Wait a bit for any previous speech to finish, then set the completion message
      // This ensures the avatar will speak the completion message even if it's currently speaking
      setTimeout(() => {
        // Check if avatar is still speaking; if so, interrupt to speak the completion message
        if (isAvatarSpeakingRef.current && avatar.current) {
          const currentSessionId = sessionIdRef.current || dataRef.current?.sessionId || sessionId;
          if (currentSessionId) {
            console.log('Interrupting current speech to deliver completion message');
            // Reset speaking state immediately so new speech isn't blocked
            shouldCancelSpeechRef.current = true;
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
          speechService.current?.suspend(doneText);
          setAvatarSpeech(doneText);
        }, 400);
      }, 500);
    } catch (error: any) {
      console.error('Error processing media with AI:', error);
      setMediaAnalyses(prev => {
        const updated = {
          ...prev,
          [mediaKey]: {
            type,
            fileName: file.name,
            status: 'error' as const,
            errorMessage: error?.message || 'Failed to analyze media'
          }
        };
        mediaAnalysesRef.current = updated; // Also update ref
        return updated;
      });
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
            // Use sessionId from ref (always current), fallback to ref data, then state
            // Use dataRef instead of data to avoid stale closure issues
            const currentSessionId = sessionIdRef.current || dataRef.current?.sessionId || sessionId;
            
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
                sessionIdFromDataRef: dataRef.current?.sessionId,
                sessionIdFromState: sessionId,
                currentSessionId
              });
            }
          } catch (err: any) {
            console.error('❌ Interrupt API call failed:', err);
            // Even if interrupt fails, we've cleared the state and set cancel flag
            // Try to continue anyway - the state has been cleared
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
        // CRITICAL: Only restart if:
        // 1. Greeting is complete
        // 2. Not currently processing AI
        // 3. Avatar is NOT speaking
        // 4. Not in grace period (waiting for resume after avatar stopped)
        if (speechService.current && 
            !speechService.current.isActive() && 
            !isAiProcessing && 
            !isInitialGreetingRef.current &&
            !isAvatarSpeakingRef.current &&
            !speechService.current.isInGracePeriod()) {
          console.log('Speech recognition not active, restarting...');
          speechService.current.forceRestart();
        } else if (speechService.current && !speechService.current.isActive()) {
          // Log why we're not restarting (for debugging)
          if (isAiProcessing) {
            console.log('⚠️ Skipping restart - AI processing');
          } else if (isInitialGreetingRef.current) {
            console.log('⚠️ Skipping restart - initial greeting');
          } else if (isAvatarSpeakingRef.current) {
            console.log('⚠️ Skipping restart - avatar is speaking');
          } else if (speechService.current.isInGracePeriod()) {
            console.log('⚠️ Skipping restart - in grace period after avatar stopped');
          }
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(checkInterval);
    }
  }, [isAvatarRunning, isAiProcessing]);


  // useEffect getting triggered when the avatarSpeech state is updated, basically make the avatar to talk
  useEffect(() => {
    async function speak() {
      // Use sessionId from ref (always current), fallback to ref data, then state
      const currentSessionId = sessionIdRef.current || dataRef.current?.sessionId || sessionId;
      if (avatarSpeech && currentSessionId) {
        // CRITICAL: Check cancellation flag FIRST before starting
        if (shouldCancelSpeechRef.current) {
          console.log('⚠️ Skipping avatar speech - cancellation flag is set');
          setAvatarSpeech('');
          shouldCancelSpeechRef.current = false; // Reset flag
          return;
        }
        
        // CRITICAL: Reset cancellation flag at start of new speech
        shouldCancelSpeechRef.current = false;
        
        // CRITICAL: If AI is processing, wait for it to complete before speaking
        // This ensures the AI response is ready before the avatar speaks
        // But DON'T clear avatarSpeech - we'll speak it once processing completes
        if (isAiProcessing) {
          console.log('⏳ Waiting for AI processing to complete before avatar speaks...');
          // Don't clear avatarSpeech - keep it so we can speak it after processing
          // The useEffect will re-run when isAiProcessing becomes false
          return;
        }
        
        // CRITICAL: Double-check avatar is not already speaking (race condition protection)
        if (isAvatarSpeakingRef.current) {
          console.log('⚠️ Skipping avatar speech - avatar already speaking');
          setAvatarSpeech('');
          return;
        }
        
        try {
          // Store the current avatarSpeech value to check if it was cleared during speak
          const speechToSpeak = avatarSpeech;
          
          // CRITICAL: Suspend speech recognition BEFORE setting speaking flag to avoid any race conditions
          // Note: suspend() now keeps recognition running but marks it for careful filtering
          // This allows user interruptions to be detected while filtering out echo
          // Pass the avatar speech text for echo detection
          speechService.current?.suspend(speechToSpeak);
          // No delay needed - recognition stays active, just marked as suspended for filtering
          
          isAvatarSpeakingRef.current = true;
          console.log('🗣️ Avatar starting to speak:', avatarSpeech.substring(0, 50) + '...');
          
          // Call speak API
          // Note: If interrupted, the server will stop but the promise may still resolve
          // The handleAvatarStopTalking event will handle cleanup
          const speakPromise = avatar.current?.speak({ taskRequest: { text: speechToSpeak, sessionId: currentSessionId } });
          
          // CRITICAL: Check cancellation flag periodically during speak
          // If cancelled while speaking, the promise will still resolve but we'll handle it
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
            // Reset cancellation flag
            shouldCancelSpeechRef.current = false;
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
          shouldCancelSpeechRef.current = false;
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
      visionCameraStreamRef.current = visionCameraStream; // Also update ref
      visionVideoRef.current.onloadedmetadata = () => {
        try { visionVideoRef.current && visionVideoRef.current.play(); } catch { }
      };
    }
  }, [visionCameraStream]);

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

  // Auto vision analysis removed - AI will only analyze camera frames when user explicitly asks
  // This prevents continuous automatic analysis that was happening before


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
      // Use a slightly longer delay to give recognition time to capture more of user's speech
      // BUT: Only process if avatar is NOT already speaking a new response
      setTimeout(() => {
        // CRITICAL: Don't process if avatar is already speaking a new response, AI is processing, or we're already processing speech
        // This prevents processing stale speech that was already handled and prevents duplicate API calls
        if (isAvatarSpeakingRef.current || isAiProcessing || isProcessingSpeechRef.current) {
          console.log('⚠️ Skipping processPendingSpeech - avatar already speaking new response, AI processing, or speech already being processed');
          return;
        }
        
        if (speechService.current) {
          console.log('🔄 Processing pending user speech after interrupt...');
          speechService.current.processPendingSpeech();
        }
      }, 800); // Longer delay to allow user to finish speaking after interrupt
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
        dataRef.current = res; // Also update ref for callback access
        setStream(avatar.current.mediaStream);
        setStartAvatarLoading(false);
        setIsAvatarRunning(true);
        // Greet the user after stream and session are ready
        setTimeout(() => {
          if (sessionId || newSessionId) {
            // CRITICAL: Stop speech recognition completely before greeting to prevent it from capturing avatar's voice
            // This is more reliable than suspend() - we don't want any recognition running during initial greeting
            const greetingText = 'Hello, I am 6, your personal assistant. How can I help you today?';
            if (speechService.current) {
              console.log('Stopping speech recognition completely before greeting...');
              speechService.current.stopListening();
              // Also suspend to mark that avatar will be speaking, pass greeting text for echo detection
              speechService.current.suspend(greetingText);
            }
            // Mark this as initial greeting to protect it from interruption
            isInitialGreetingRef.current = true;
            console.log('👋 Starting initial greeting...');
            setAvatarSpeech(greetingText);
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
                    transform: `translateY(${6 + designSettings.cameraButton.position.top}rem)`,
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
                        visionCameraStreamRef.current = stream; // Also update ref
                        setCameraFacingMode('environment'); // Reset to rear-facing when opening
                        setIsVisionMode(true);
                        isVisionModeRef.current = true; // Also update ref
                      } catch (error) {
                        console.error('Error accessing camera:', error);
                        // Fallback to front-facing if rear-facing fails
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'user' }
                          });
                          setVisionCameraStream(stream);
                          visionCameraStreamRef.current = stream; // Also update ref
                          setCameraFacingMode('user');
                          setIsVisionMode(true);
                          isVisionModeRef.current = true; // Also update ref
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
                    className="flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl border border-white/20"
                    style={{
                      opacity: designSettings.cameraButton.opacity,
                      backgroundColor: designSettings.cameraButton.color,
                      width: `${designSettings.cameraButton.size * 1.6}px`,
                      height: `${designSettings.cameraButton.size}px`,
                      transform: `translate(${designSettings.cameraButton.position.left}rem, 0)`,
                      borderRadius: '50%'
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Open vision mode'}
                  >
                    <svg 
                      className="text-white" 
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
                    onClick={async () => {
                      // On mobile (especially iOS), video recording is blocked if any media stream
                      // (audio or video) is active, as iOS treats it as an "active call".
                      // We must stop ALL active media streams before opening the file picker.
                      
                      // 1. Stop speech recognition (which may have active audio tracks)
                      if (speechService.current && speechService.current.isActive()) {
                        console.log('Stopping speech recognition to allow video recording...');
                        speechService.current.stopListening();
                      }
                      
                      // 2. Stop vision camera stream (video tracks)
                      if (visionCameraStream) {
                        console.log('Stopping vision camera stream to allow video recording...');
                        visionCameraStream.getTracks().forEach(t => t.stop());
                        setVisionCameraStream(null);
                        visionCameraStreamRef.current = null; // Also update ref
                        setIsVisionMode(false);
                        isVisionModeRef.current = false; // Also update ref
                      }
                      
                      // 3. Stop any active tracks from video elements
                      if (visionVideoRef.current?.srcObject) {
                        const stream = visionVideoRef.current.srcObject as MediaStream;
                        stream.getTracks().forEach(t => t.stop());
                        visionVideoRef.current.srcObject = null;
                      }
                      
                      // Small delay to ensure all streams are fully stopped before opening picker
                      // iOS needs this delay to properly release the camera/microphone
                      setTimeout(() => {
                        fileInputRef.current?.click();
                      }, 200);
                    }}
                    disabled={isAiProcessing}
                    className="flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl border border-white/20"
                    style={{
                      opacity: designSettings.paperClipButton.opacity,
                      backgroundColor: designSettings.paperClipButton.color,
                      width: `${designSettings.paperClipButton.size * 1.6}px`,
                      height: `${designSettings.paperClipButton.size}px`,
                      transform: `translate(${designSettings.paperClipButton.position.left}rem, 0)`,
                      borderRadius: '50%'
                    }}
                    title={isAiProcessing ? 'AI is processing...' : 'Upload images or videos'}
                  >
                    <svg 
                      className="text-white" 
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
                {/* {latestMediaKey && mediaAnalyses[latestMediaKey]?.status === 'ready' && (
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
                )} */}
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
        {/* {isAvatarRunning && !startAvatarLoading && hasUserStartedChatting && (
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
        )} */}

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
                className="flex items-center justify-center text-white shadow-lg transition-all duration-200"
                style={{ padding: '12px 18px', borderRadius: '50%', backgroundColor: '#BC7300' }}
                title={cameraFacingMode === 'environment' ? 'Switch to selfie mode' : 'Switch to rear camera'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
              {/* Exit Button */}
              <button
                onClick={exitVisionMode}
                className="flex items-center justify-center text-white shadow-lg transition-all duration-200"
                style={{ padding: '12px 18px', borderRadius: '50%', backgroundColor: '#BC7300' }}
                title="Exit Vision Mode"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* What can you see button - Bottom center */}
            {/* <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <button
                onClick={handleWhatCanYouSee}
                disabled={isAiProcessing}
                className={`px-8 py-3 shadow-lg transition-all duration-200 font-semibold text-sm sm:text-base ${
                  isAiProcessing 
                    ? 'bg-purple-400 cursor-not-allowed text-white' 
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                }`}
                style={{ borderRadius: '50px' }}
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
            </div> */}
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
              className={`shadow-lg transition-all duration-200 ${
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


