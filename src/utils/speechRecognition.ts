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
    // CRITICAL: If avatar is speaking (suspended), COMPLETELY IGNORE all audio - it's echo
    this.recognition.onspeechstart = () => {
      console.log('🎤 Audio activity detected (onspeechstart)');
      
      // CRITICAL: If suspended, avatar is speaking - IGNORE ALL audio completely
      // This prevents avatar's speech from being detected as user input
      if (this.isSuspended) {
        const timeSinceAvatarStarted = Date.now() - this.avatarSpeechStartTime;
        console.log(`🚫 Ignoring audio while avatar speaking (${timeSinceAvatarStarted}ms after avatar started) - this is avatar echo, not user speech`);
        // Don't process or interrupt - just ignore completely
        return;
      }
      
      // Avatar not speaking - this could be user speech
      if (this.onSpeechStart) {
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

      // CRITICAL: If suspended, avatar is speaking - IGNORE ALL results completely
      // Recognition should be stopped when suspended, but if we somehow get results, ignore them
      if (this.isSuspended) {
        console.log('🚫 Ignoring result while suspended (avatar is speaking) - this is avatar echo, not user speech');
        this.clearAccumulatedText(); // Clear any partial accumulation
        return; // Don't process anything while avatar is speaking
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
      console.log('Speech recognition ended');
      
      // CRITICAL: If suspended, avatar is speaking - don't process anything and don't restart
      // The resume() method will restart it after avatar stops (with grace period)
      if (this.isSuspended) {
        console.log('🚫 Recognition ended while suspended (avatar speaking) - not restarting or processing');
        this.clearAccumulatedText();
        return; // Don't restart or process anything while avatar is speaking
      }
      
      // CRITICAL: Only process accumulated text if we're not in grace period
      // UNLESS we have preserved user speech or user interrupted, in which case always process it
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      // If we have preserved user speech OR user just interrupted, always process it regardless of grace period
      if ((this.hasPreservedUserSpeech || this.userInterruptedAvatar) && this.accumulatedText.trim().length > 0) {
        console.log('Processing user speech on end (after interruption):', this.accumulatedText);
        this.onResult(this.accumulatedText.trim());
        this.accumulatedText = '';
        this.hasPreservedUserSpeech = false;
        this.userInterruptedAvatar = false;
      } else if (!isInGracePeriod && this.accumulatedText.trim().length > 0) {
        console.log('Processing remaining accumulated text on end:', this.accumulatedText);
        this.onResult(this.accumulatedText.trim());
        this.accumulatedText = '';
      } else {
        // Clear accumulated text if in grace period (and not preserved/interrupted)
        if (isInGracePeriod && !this.hasPreservedUserSpeech && !this.userInterruptedAvatar) {
          console.log('Clearing accumulated text on end (grace period)');
          this.clearAccumulatedText();
        }
      }
      
      // Automatically restart listening after a short delay (only if not suspended)
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
  // CRITICAL: Actually STOP the recognition to prevent it from detecting avatar's speech
  // We'll restart it when avatar stops speaking (with a grace period)
  public suspend(): void {
    this.isSuspended = true;
    // Record when avatar started speaking to ignore echo/feedback
    this.avatarSpeechStartTime = Date.now();
    // CRITICAL: Actually STOP the recognition to prevent detecting avatar's audio
    // This prevents the avatar's voice from being captured and processed as user speech
    if (this.recognition && this.isListening) {
      console.log('🛑 Stopping speech recognition to prevent capturing avatar speech');
      try {
        this.recognition.stop();
        this.isListening = false;
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
    }
    this.clearAccumulatedText();
  }

  // Resume recognition after suspension
  // Wait for grace period before restarting to avoid capturing tail-end echo
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
    
    // Wait for grace period before restarting to avoid capturing tail-end echo
    // Then restart recognition
    setTimeout(() => {
      if (!this.isSuspended && !this.isListening) {
        console.log('🔄 Resuming speech recognition after avatar stopped (grace period passed)');
        this.startListening().catch(console.error);
      }
    }, this.POST_AVATAR_GRACE_PERIOD_MS);
  }

  // Force clear suspension - used when user interrupts avatar
  // Immediately clears suspension and restarts recognition to capture user's speech
  public forceResume(): void {
    this.isSuspended = false;
    // Mark that user actively interrupted avatar - this disables grace period for active speech
    this.userInterruptedAvatar = true;
    // Record when avatar was interrupted for grace period
    this.avatarSpeechEndTime = Date.now();
    
    // Clear any accumulated text - recognition was stopped, so this is likely echo
    this.clearAccumulatedText();
    this.hasPreservedUserSpeech = false;
    
    // Clear avatar speech start time since avatar was interrupted
    this.avatarSpeechStartTime = 0;
    
    // Immediately restart recognition to capture user's ongoing speech
    // Recognition was stopped when suspended, so we need to start it again
    console.log('🔄 Force resuming speech recognition - user interrupted avatar');
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

