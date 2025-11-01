// Client-side speech recognition utility
export class SpeechRecognitionService {
  private recognition: any;
  private isListening: boolean = false;
  private onResult: (text: string) => void;
  private onError: (error: string) => void;
  private accumulatedText: string = '';
  private speechTimeout: any = null;
  private onSpeechStart?: () => void;
  private isSuspended: boolean = false;
  private avatarSpeechStartTime: number = 0; // Timestamp when avatar started speaking
  private avatarSpeechEndTime: number = 0; // Timestamp when avatar stopped speaking
  private hasPreservedUserSpeech: boolean = false; // Flag to indicate user speech was preserved during interruption
  private userInterruptedAvatar: boolean = false; // Flag to indicate user just interrupted avatar (disables grace period for active speech)
  private readonly EARLY_ECHO_THRESHOLD_MS = 500; // Ignore audio detected within 500ms of avatar starting (likely echo)
  private readonly POST_AVATAR_GRACE_PERIOD_MS = 1500; // Ignore speech detected within 1.5 seconds after avatar stops (tail-end echo)

  constructor(onResult: (text: string) => void, onError: (error: string) => void, onSpeechStart?: () => void) {
    this.onResult = onResult;
    this.onError = onError;
    this.onSpeechStart = onSpeechStart;
    this.initializeRecognition();
  }

  private initializeRecognition() {
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.onError('Speech recognition not supported in this browser');
      return;
    }

    // Create speech recognition instance
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configure recognition settings
    this.recognition.continuous = true; // Keep listening continuously
    this.recognition.interimResults = true; // Get interim results to accumulate speech
    this.recognition.lang = 'en-US'; // Set language
    this.recognition.maxAlternatives = 1; // Only return best result

    // Set up event handlers
    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('Speech recognition started');
    };

    // Fire as soon as browser detects ANY audio/speech activity
    // This is the EARLIEST possible detection - interrupt avatar immediately
    this.recognition.onspeechstart = () => {
      console.log('🎤 Audio activity detected (onspeechstart)');
      
      // CRITICAL: If avatar is speaking, interrupt IMMEDIATELY on ANY audio detection
      // Don't wait for meaningful transcripts - interrupt as soon as audio is detected
      if (this.isSuspended && this.onSpeechStart) {
        const timeSinceAvatarStarted = Date.now() - this.avatarSpeechStartTime;
        
        // Only respect echo cooldown for very early detection (first 500ms)
        // After that, any audio is likely user speech - interrupt immediately
        if (timeSinceAvatarStarted < this.EARLY_ECHO_THRESHOLD_MS) {
          console.log(`⚠️ Ignoring very early audio (${timeSinceAvatarStarted}ms) - likely echo from avatar start`);
          return; // Ignore echo from avatar's own speech start
        }
        
        console.log(`✅ Audio detected while avatar speaking (${timeSinceAvatarStarted}ms) - interrupting immediately`);
        try {
          this.onSpeechStart();
        } catch (err) {
          console.error('onSpeechStart handler error:', err);
        }
      } else if (!this.isSuspended && this.onSpeechStart) {
        // Avatar not speaking - notify callback, but callback should check if it's safe to interrupt
        // (e.g., initial greeting might still be protected)
        try {
          this.onSpeechStart();
        } catch (err) {
          console.error('onSpeechStart handler error:', err);
        }
      }
    };

    this.recognition.onresult = (event: any) => {
      // CRITICAL: Check if we're in a grace period after avatar stopped speaking
      // This prevents tail-end echo from being processed
      // BUT: If user just interrupted avatar, disable grace period for active user speech
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      // Only apply grace period if user didn't actively interrupt (to allow their speech to be captured)
      if (isInGracePeriod && !this.userInterruptedAvatar) {
        // Check if there's actual user speech activity in this result
        let hasUserSpeech = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript.length > 0) {
            hasUserSpeech = true;
            break;
          }
        }
        
        // Only ignore if there's no active user speech (likely echo)
        if (!hasUserSpeech) {
          console.log(`⚠️ Ignoring speech in grace period after avatar stopped (${timeSinceAvatarEnded}ms < ${this.POST_AVATAR_GRACE_PERIOD_MS}ms):`, 'likely tail-end echo');
          this.clearAccumulatedText();
          return; // Ignore echo during grace period
        } else {
          // Active user speech detected during grace period - user must be speaking, so capture it
          console.log(`✅ Active user speech detected during grace period - capturing (${timeSinceAvatarEnded}ms after avatar stopped)`);
          this.userInterruptedAvatar = true; // Mark that user is actively speaking
        }
      }

      // If suspended (e.g., avatar is talking), check if this is user speech for interruption
      // IMPORTANT: While suspended, we only interrupt - we NEVER process results as user input
      // Note: Interruption should happen via onspeechstart (faster), but we check here as fallback
      if (this.isSuspended) {
        const timeSinceAvatarStarted = Date.now() - this.avatarSpeechStartTime;
        
        // Check for ANY audio activity (even single characters) - interrupt immediately
        let hasAudioActivity = false;
        let audioTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim();
          // Detect ANY audio activity (even minimal) for immediate interruption
          if (transcript.length > 0) {
            hasAudioActivity = true;
            audioTranscript = transcript;
            console.log('Audio activity detected in result while suspended:', transcript, `[${timeSinceAvatarStarted}ms after avatar started]`);
            break;
          }
        }
        
        // If ANY audio detected while suspended, interrupt immediately
        // The echo cooldown is handled in onspeechstart for faster response
        if (hasAudioActivity) {
          // Very early audio (first 500ms) might be echo - but still interrupt if we got here
          // (onspeechstart should have caught it, but this is fallback)
          if (timeSinceAvatarStarted < this.EARLY_ECHO_THRESHOLD_MS) {
            console.log(`⚠️ Very early audio in result (${timeSinceAvatarStarted}ms) - might be echo, but interrupting anyway`);
            // For very early audio, clear it as it's likely echo
            this.clearAccumulatedText();
          } else {
            // After echo threshold, this is likely real user speech
            // Keep the accumulated text to preserve user's speech that started during suspension
            // But only if it's substantial (more than just a character or two)
            if (audioTranscript.trim().length < 3) {
              this.clearAccumulatedText();
            } else {
              console.log('✅ Preserving user speech captured during suspension:', audioTranscript);
              this.hasPreservedUserSpeech = true; // Mark as preserved user speech
              // Keep accumulated text - this is real user speech
            }
          }
          
          // Clear suspension so we can capture user's ongoing speech
          this.isSuspended = false;
          
          console.log('✅ Audio activity detected in result - clearing suspension. Transcript:', audioTranscript);
          
          // Trigger interrupt callback (onspeechstart should have already done this, but ensure it)
          if (this.onSpeechStart) {
            try {
              this.onSpeechStart();
            } catch (err) {
              console.error('onSpeechStart handler error during suspension:', err);
            }
          }
          
          // IMPORTANT: Continue processing to accumulate the full user speech
          // Don't return here - let the normal accumulation logic handle it
        } else {
          // No audio activity detected, ignore this result completely
          this.clearAccumulatedText(); // Clear any partial accumulation
          return;
        }
      }
      let interimTranscript = '';
      let finalTranscript = '';
      
      // Process all results to accumulate speech
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update accumulated text with final results
      if (finalTranscript.trim().length > 0) {
        this.accumulatedText += finalTranscript;
        console.log('Final transcript added:', finalTranscript);
        console.log('Accumulated text so far:', this.accumulatedText);
        
        // Check if the sentence seems complete (ends with punctuation or pause)
        if (this.isSentenceComplete(this.accumulatedText)) {
          console.log('Sentence complete, processing:', this.accumulatedText);
          this.onResult(this.accumulatedText.trim());
          this.accumulatedText = ''; // Reset for next sentence
          this.hasPreservedUserSpeech = false; // Clear preserved flag after processing
          this.userInterruptedAvatar = false; // Clear interruption flag after processing
        }
      }
      
      // Clear any existing timeout and set a new one for interim results
      if (interimTranscript.trim().length > 0) {
        // Fallback: if onspeechstart isn't supported, treat interim as speech start signal
        if (this.onSpeechStart) {
          try {
            this.onSpeechStart();
          } catch (err) {
            console.error('onSpeechStart handler error:', err);
          }
        }
        if (this.speechTimeout) {
          clearTimeout(this.speechTimeout);
        }
        
        // Set timeout to process accumulated text if user stops speaking
        // But only if we're not suspended and not in grace period
        // UNLESS we have preserved user speech (from interruption), in which case process it
        // Use shorter timeout if user interrupted (faster response)
        const timeoutDuration = this.userInterruptedAvatar ? 1500 : 2000;
        this.speechTimeout = setTimeout(() => {
          // Check again if we're suspended or in grace period before processing
          const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
          const isInGracePeriod = timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
          
          // If we have preserved user speech (from interruption), always process it regardless of grace period
          // OR if user just interrupted avatar (active speech after interruption)
          if ((this.hasPreservedUserSpeech || this.userInterruptedAvatar) && this.accumulatedText.trim().length > 0) {
            console.log('Speech timeout reached, processing user speech after interruption:', this.accumulatedText);
            this.onResult(this.accumulatedText.trim());
            this.accumulatedText = '';
            this.hasPreservedUserSpeech = false; // Clear flag after processing
            this.userInterruptedAvatar = false; // Clear interruption flag
          } else if (!this.isSuspended && !isInGracePeriod && this.accumulatedText.trim().length > 0) {
            console.log('Speech timeout reached, processing accumulated text:', this.accumulatedText);
            this.onResult(this.accumulatedText.trim());
            this.accumulatedText = '';
          } else {
            // Clear accumulated text if we're suspended or in grace period (and not preserved/interrupted)
            if (this.isSuspended || (isInGracePeriod && !this.hasPreservedUserSpeech && !this.userInterruptedAvatar)) {
              console.log('Clearing accumulated text on timeout (suspended or in grace period)');
              this.clearAccumulatedText();
              this.hasPreservedUserSpeech = false; // Clear flag
              this.userInterruptedAvatar = false; // Clear interruption flag
            }
          }
        }, timeoutDuration); // Shorter timeout (1.5s) if user interrupted, otherwise 2s
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      let errorMessage = event.error;
      let shouldRestart = false;
      
      if (event.error === 'not-allowed') {
        errorMessage = 'Microphone access denied. Please allow microphone access and refresh the page.';
      } else if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please try again.';
        shouldRestart = true; // Restart for no-speech errors
      } else if (event.error === 'audio-capture') {
        errorMessage = 'No microphone found. Please check your microphone connection.';
      } else if (event.error === 'network') {
        errorMessage = 'Network error. Please check your internet connection.';
        shouldRestart = true; // Restart for network errors
      } else if (event.error === 'aborted') {
        console.log('Speech recognition aborted - this is normal, will restart automatically');
        shouldRestart = true; // Restart for aborted errors (common with continuous listening)
        return; // Don't show error for aborted, just restart
      } else if (event.error === 'service-not-allowed') {
        errorMessage = 'Speech recognition service not allowed. Please check your browser settings.';
      } else {
        shouldRestart = true; // Restart for other errors
      }
      
      if (!shouldRestart) {
        this.onError(errorMessage);
      }
      
      this.isListening = false;
      this.clearAccumulatedText(); // Clear any accumulated text on error
      
      // Auto-restart for recoverable errors
      if (shouldRestart && !this.isSuspended) {
        setTimeout(() => {
          if (!this.isListening) {
            console.log('Auto-restarting speech recognition after error...');
            this.startListening().catch(console.error);
          }
        }, 1000);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      console.log('Speech recognition ended - restarting...');
      
      // CRITICAL: Only process accumulated text if we're not suspended and not in grace period
      // UNLESS we have preserved user speech, in which case always process it
      // This prevents processing avatar echo that might have accumulated
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      // If we have preserved user speech OR user just interrupted, always process it regardless of grace period
      if ((this.hasPreservedUserSpeech || this.userInterruptedAvatar) && this.accumulatedText.trim().length > 0) {
        console.log('Processing user speech on end (after interruption):', this.accumulatedText);
        this.onResult(this.accumulatedText.trim());
        this.accumulatedText = '';
        this.hasPreservedUserSpeech = false;
        this.userInterruptedAvatar = false;
      } else if (!this.isSuspended && !isInGracePeriod && this.accumulatedText.trim().length > 0) {
        console.log('Processing remaining accumulated text on end:', this.accumulatedText);
        this.onResult(this.accumulatedText.trim());
        this.accumulatedText = '';
      } else {
        // Clear accumulated text if we're suspended or in grace period (and not preserved/interrupted)
        if (this.isSuspended || (isInGracePeriod && !this.hasPreservedUserSpeech && !this.userInterruptedAvatar)) {
          console.log('Clearing accumulated text on end (suspended or in grace period)');
          this.clearAccumulatedText();
        }
      }
      
      // Automatically restart listening after a short delay
      setTimeout(() => {
        if (!this.isListening && !this.isSuspended) {
          console.log('Auto-restarting speech recognition from onend...');
          this.startListening().catch((error) => {
            console.error('Failed to restart speech recognition:', error);
            // Try again after a longer delay if restart fails
            setTimeout(() => {
              if (!this.isListening && !this.isSuspended) {
                this.startListening().catch(console.error);
              }
            }, 3000);
          });
        }
      }, 500); // Shorter delay for faster restart
    };
  }

  public async startListening(): Promise<void> {
    if (this.recognition && !this.isListening && !this.isSuspended) {
      try {
        // Request microphone permission first with enhanced echo cancellation
        // These settings help prevent avatar's audio output from being picked up
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,      // Critical: Cancel echo from speakers
            noiseSuppression: true,      // Reduce background noise
            autoGainControl: true,       // Normalize volume
            sampleRate: 16000,           // Standard sample rate for speech recognition
            channelCount: 1              // Mono audio is sufficient
          }
        });
        console.log('Starting speech recognition with echo cancellation...');
        this.recognition.start();
      } catch (error: any) {
        console.error('Microphone access error:', error);
        if (error.name === 'NotAllowedError') {
          this.onError('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          this.onError('No microphone found. Please check your microphone connection.');
        } else {
          this.onError('Failed to access microphone. Please check your device settings.');
        }
      }
    } else if (this.recognition && this.isListening) {
      console.log('Speech recognition already listening');
    } else {
      console.log('Speech recognition not available');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  // Temporarily suspend recognition and prevent auto-restarts/results
  // NOTE: We don't abort recognition to allow it to detect user speech for interruption
  // Results are filtered by the isSuspended flag instead
  public suspend(): void {
    this.isSuspended = true;
    // Record when avatar started speaking to ignore echo/feedback
    this.avatarSpeechStartTime = Date.now();
    // Don't abort recognition - keep it running to detect user speech for interruption
    // Results will be filtered out by the isSuspended check in onresult
    this.clearAccumulatedText();
  }

  // Resume recognition after suspension
  public resume(): void {
    this.isSuspended = false;
    // Record when avatar stopped speaking for grace period
    this.avatarSpeechEndTime = Date.now();
    // Clear avatar speech start time since avatar is no longer speaking
    this.avatarSpeechStartTime = 0;
    // Clear interruption flag since avatar finished naturally (not interrupted)
    this.userInterruptedAvatar = false;
    // Clear any accumulated text that might contain echo
    this.clearAccumulatedText();
    this.startListening().catch(console.error);
  }

  // Force clear suspension - used when user interrupts avatar
  // Immediately clears suspension so user's ongoing speech can be captured and processed
  // Note: suspension may already be cleared by onresult handler, so this is idempotent
  public forceResume(): void {
    this.isSuspended = false;
    // Mark that user actively interrupted avatar - this disables grace period for active speech
    this.userInterruptedAvatar = true;
    // Record when avatar was interrupted for grace period
    this.avatarSpeechEndTime = Date.now();
    
    // Calculate time since avatar started speaking
    const timeSinceAvatarStarted = this.avatarSpeechStartTime > 0 ? Date.now() - this.avatarSpeechStartTime : Infinity;
    
    // Only clear accumulated text if:
    // 1. We're not in the early echo threshold (first 500ms) - if we are, onresult already handled it
    // 2. The accumulated text is very short (likely echo/noise)
    // Otherwise, preserve it as it might be user speech that started during suspension
    if (timeSinceAvatarStarted < this.EARLY_ECHO_THRESHOLD_MS) {
      // Very early - clear as it's definitely echo
      this.clearAccumulatedText();
      console.log('Force resume: Cleared early echo');
    } else if (this.accumulatedText.trim().length < 3) {
      // Very short text - likely noise/echo, but don't clear flag since user is actively speaking
      this.accumulatedText = ''; // Clear text but keep interruption flag
      console.log('Force resume: Cleared short text (likely echo), but user is actively speaking');
    } else {
      // Substantial text after echo period - preserve it as user speech
      console.log('Force resume: Preserving accumulated text (likely user speech):', this.accumulatedText.substring(0, 50));
      this.hasPreservedUserSpeech = true; // Mark this as preserved user speech
      // Clear any existing timeout - we'll let new results or timeout handle it
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
        this.speechTimeout = null;
      }
      // Set a new timeout to process the preserved text, but shorter since user already started speaking
      this.speechTimeout = setTimeout(() => {
        if (this.accumulatedText.trim().length > 0 && (this.hasPreservedUserSpeech || this.userInterruptedAvatar)) {
          console.log('Processing preserved user speech after interruption:', this.accumulatedText);
          this.onResult(this.accumulatedText.trim());
          this.accumulatedText = '';
          this.hasPreservedUserSpeech = false;
          this.userInterruptedAvatar = false;
        }
      }, 1500); // Shorter timeout for preserved speech
    }
    
    // Clear avatar speech start time since avatar was interrupted
    this.avatarSpeechStartTime = 0;
    
    // Recognition should already be running (we don't abort on suspend anymore)
    // Since recognition stays active, it can immediately capture user's ongoing speech
    // Just ensure it's listening - if not, start it
    if (!this.isListening && this.recognition) {
      this.startListening().catch(console.error);
    }
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  public setLanguage(lang: string): void {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public forceRestart(): void {
    console.log('Force restarting speech recognition...');
    this.isListening = false;
    this.startListening().catch(console.error);
  }

  public isActive(): boolean {
    return this.isListening;
  }

  private isSentenceComplete(text: string): boolean {
    const trimmedText = text.trim();
    
    // Check if text ends with sentence-ending punctuation
    const sentenceEnders = ['.', '!', '?', '。', '！', '？'];
    const endsWithPunctuation = sentenceEnders.some(punct => trimmedText.endsWith(punct));
    
    // Check if text is long enough to be a complete sentence (more than 10 characters)
    const isLongEnough = trimmedText.length > 10;
    
    // Check if text contains common sentence-ending words
    const sentenceEndingWords = ['thanks', 'thank you', 'bye', 'goodbye', 'okay', 'ok', 'done', 'finished', 'complete'];
    const endsWithCommonWords = sentenceEndingWords.some(word => 
      trimmedText.toLowerCase().endsWith(word.toLowerCase())
    );
    
    return endsWithPunctuation || (isLongEnough && endsWithCommonWords) || trimmedText.length > 100;
  }

  public clearAccumulatedText(): void {
    this.accumulatedText = '';
    this.hasPreservedUserSpeech = false; // Clear preserved flag when clearing text
    // Don't clear userInterruptedAvatar here - it should only clear after processing or natural completion
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
  }

  // Force process accumulated text if user interrupted avatar and there's pending speech
  public processPendingSpeech(): void {
    if (this.userInterruptedAvatar && this.accumulatedText.trim().length > 0) {
      console.log('Force processing pending user speech after avatar stopped:', this.accumulatedText);
      this.onResult(this.accumulatedText.trim());
      this.accumulatedText = '';
      this.hasPreservedUserSpeech = false;
      this.userInterruptedAvatar = false;
      // Clear any pending timeout since we're processing now
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
        this.speechTimeout = null;
      }
    }
  }
}

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

