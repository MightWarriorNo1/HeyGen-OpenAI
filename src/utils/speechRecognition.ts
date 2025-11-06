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
  private readonly POST_AVATAR_GRACE_PERIOD_MS = 3000; // Ignore speech detected within 3 seconds after avatar stops (tail-end echo) - increased from 2s
  private audioStream: MediaStream | null = null; // Store the audio stream to properly stop it
  private isResuming: boolean = false; // Flag to indicate we're waiting for grace period to complete
  private currentAvatarSpeech: string = ''; // Store current avatar speech text for echo detection

  constructor(onResult: (text: string) => void, onError: (error: string) => void, onSpeechStart?: () => void) {
    this.onResult = onResult;
    this.onError = onError;
    this.onSpeechStart = onSpeechStart;
    this.initializeRecognition();
  }

  // Method to update current avatar speech text for echo detection
  public setAvatarSpeech(text: string): void {
    this.currentAvatarSpeech = text.toLowerCase().trim();
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
    // CRITICAL: When suspended, we still allow audio detection but filter carefully in onresult
    this.recognition.onspeechstart = () => {
      console.log('🎤 Audio activity detected (onspeechstart)');
      
      // CRITICAL: If resuming, we're in grace period - ignore audio to prevent echo
      if (this.isResuming) {
        const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : 0;
        console.log(`🚫 Ignoring audio while resuming (grace period, ${timeSinceAvatarEnded}ms after avatar ended) - this is avatar echo, not user speech`);
        return;
      }
      
      // CRITICAL: If suspended (avatar speaking), we still allow audio detection
      // The onresult handler will filter to distinguish user speech from echo
      // BUT: During initial protection period (first 6 seconds), completely ignore audio to prevent false triggers
      if (this.isSuspended) {
        const timeSinceAvatarStarted = this.avatarSpeechStartTime > 0 ? Date.now() - this.avatarSpeechStartTime : 0;
        const INITIAL_PROTECTION_MS = 6000; // Match the protection period in onresult
        
        if (timeSinceAvatarStarted < INITIAL_PROTECTION_MS) {
          console.log(`🛡️ Ignoring audio during protection period (${timeSinceAvatarStarted}ms < ${INITIAL_PROTECTION_MS}ms) - this is avatar echo, not user speech`);
          return; // Completely ignore during initial period
        }
        
        console.log(`🎤 Audio detected while avatar speaking (${timeSinceAvatarStarted}ms after avatar started) - will filter in onresult to detect interruptions`);
        // Don't return - allow onSpeechStart callback so we can track user speech attempts
        // The onresult handler will carefully filter to distinguish user speech from echo
      }
      
      // CRITICAL: Check if we're in grace period (but not suspended)
      if (this.isInGracePeriod() && !this.isSuspended) {
        console.log('🚫 Ignoring audio in grace period after avatar stopped - this is avatar echo, not user speech');
        return;
      }
      
      // Avatar not speaking or user might be interrupting - allow onSpeechStart callback
      if (this.onSpeechStart) {
        try {
          this.onSpeechStart();
        } catch (err) {
          console.error('onSpeechStart handler error:', err);
        }
      }
    };

    this.recognition.onresult = (event: any) => {
      // CRITICAL: When suspended (avatar speaking), we need to be careful
      // We should still accumulate text to detect user interruptions, but filter out echo
      if (this.isSuspended) {
        // CRITICAL: During the first 6 seconds of avatar speaking, ignore ALL speech completely
        // After 6 seconds, allow user interruptions but check for echo carefully
        // This balances echo prevention with allowing legitimate user interruptions
        const timeSinceAvatarStarted = this.avatarSpeechStartTime > 0 ? Date.now() - this.avatarSpeechStartTime : Infinity;
        const INITIAL_PROTECTION_MS = 6000; // Ignore all speech for first 6 seconds (reduced from 12s to allow interruptions)
        
        if (timeSinceAvatarStarted < INITIAL_PROTECTION_MS) {
          console.log(`🛡️ Ignoring ALL speech during protection period (${timeSinceAvatarStarted}ms < ${INITIAL_PROTECTION_MS}ms) - this is avatar echo, not user speech`);
          this.clearAccumulatedText(); // Clear any accumulated text to prevent false positives
          return; // Completely ignore during protection period
        }
        
        // Check if this looks like substantial user speech (interruption) vs echo
        let interimTranscript = '';
        let finalTranscript = '';
        
        // Process all results to check transcript length
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
          // Accumulate text to check if it's substantial enough to be a real interruption
          const newText = (finalTranscript + interimTranscript).trim();
          if (newText.length > 0) {
            // CRITICAL: Check if this text is already in accumulated text to prevent duplicates
            // Only add if it's new text
            if (!this.accumulatedText.includes(newText)) {
              // Add to accumulated text first (for echo detection)
              this.accumulatedText += newText;
            } else {
              console.log('⚠️ Skipping duplicate text in suspended branch:', newText);
              return; // Skip duplicate
            }
          
          // CRITICAL: Check if detected text matches or is very similar to avatar's current speech
          // This is a strong indicator of echo - check AFTER accumulating
          const fullDetectedText = this.accumulatedText.toLowerCase().trim();
          // Normalize: remove punctuation, contractions, and extra spaces for better comparison
          const normalizedDetected = fullDetectedText
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .replace(/\b(ive|youve|weve|theyve|ive|dont|wont|cant|isnt|arent|wasnt|werent)\b/g, ' ') // Remove contractions
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
          const avatarSpeechLower = this.currentAvatarSpeech;
          const normalizedAvatar = avatarSpeechLower
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .replace(/\b(ive|youve|weve|theyve|ive|dont|wont|cant|isnt|arent|wasnt|werent)\b/g, ' ') // Remove contractions
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
          
          // Check for similarity - if detected text matches avatar speech, it's echo
          let isEcho = false;
          if (normalizedAvatar.length > 0 && normalizedDetected.length > 0) {
            // Extract words from both texts for comparison (ignore short words like "i", "a", "the")
            const detectedWords = normalizedDetected.split(/\s+/).filter(w => w.length > 2);
            const avatarWords = normalizedAvatar.split(/\s+/).filter(w => w.length > 2);
            
            if (detectedWords.length > 0 && avatarWords.length > 0) {
              // Check word overlap - if 2+ words match, it's likely echo (lowered from 3)
              // This catches cases like "I completed analyzing your images" matching "Perfect! I've completed analyzing your image..."
              const matchingWords = detectedWords.filter(w => avatarWords.includes(w));
              
              // CRITICAL: If we have 2+ matching words, it's echo (lowered from 3 to catch more echo cases)
              // This catches partial echoes like "completed analyzing your" matching "I've completed analyzing your image"
              if (matchingWords.length >= 2) {
                isEcho = true;
                const detectedStart = normalizedDetected.substring(0, Math.min(60, normalizedDetected.length));
                const avatarStart = normalizedAvatar.substring(0, Math.min(60, normalizedAvatar.length));
                console.log(`🚫 Detected echo - ${matchingWords.length} matching words (${matchingWords.join(', ')}): "${detectedStart}..." matches "${avatarStart}..."`);
                this.clearAccumulatedText(); // Clear echo immediately
                return; // Ignore echo
              }
              
              // Also check overlap ratio - if more than 20% of words match AND we have 1+ matching words, it's likely echo
              // Lowered threshold to catch more cases
              const overlapRatio = matchingWords.length / Math.max(detectedWords.length, avatarWords.length);
              if (overlapRatio > 0.2 && matchingWords.length >= 1) {
                isEcho = true;
                const detectedStart = normalizedDetected.substring(0, Math.min(60, normalizedDetected.length));
                const avatarStart = normalizedAvatar.substring(0, Math.min(60, normalizedAvatar.length));
                console.log(`🚫 Detected echo - high word overlap (${Math.round(overlapRatio * 100)}%, ${matchingWords.length} matching words): "${detectedStart}..." matches "${avatarStart}..."`);
                this.clearAccumulatedText(); // Clear echo immediately
                return; // Ignore echo
              }
              
              // CRITICAL: Check for consecutive word sequences - if 2+ words appear in sequence in both texts, it's echo (lowered from 3)
              // This catches cases like "completed analyzing your" appearing in sequence in both
              let maxConsecutiveMatches = 0;
              // Check for 2-word sequences (more aggressive)
              for (let i = 0; i <= detectedWords.length - 2; i++) {
                const sequence = detectedWords.slice(i, i + 2).join(' ');
                // Check if this 2-word sequence appears anywhere in avatar words (as consecutive words)
                for (let j = 0; j <= avatarWords.length - 2; j++) {
                  const avatarSequence = avatarWords.slice(j, j + 2).join(' ');
                  if (sequence === avatarSequence) {
                    maxConsecutiveMatches = Math.max(maxConsecutiveMatches, 2);
                    break;
                  }
                }
                if (maxConsecutiveMatches >= 2) break;
              }
              
              if (maxConsecutiveMatches >= 2) {
                isEcho = true;
                const detectedStart = normalizedDetected.substring(0, Math.min(60, normalizedDetected.length));
                const avatarStart = normalizedAvatar.substring(0, Math.min(60, normalizedAvatar.length));
                console.log(`🚫 Detected echo - ${maxConsecutiveMatches} consecutive matching words in sequence: "${detectedStart}..." matches "${avatarStart}..."`);
                this.clearAccumulatedText(); // Clear echo immediately
                return; // Ignore echo
              }
            }
            
            // Check if detected text is a substring of avatar speech (echo detection)
            // Check if detected text appears anywhere in avatar speech (not just at start)
            const compareLength = Math.min(normalizedDetected.length, normalizedAvatar.length);
            if (compareLength >= 10) { // Lowered from 20 to catch shorter echoes
              const detectedStart = normalizedDetected.substring(0, Math.min(60, normalizedDetected.length));
              // Check if detected text appears in avatar speech (anywhere, not just start)
              if (normalizedAvatar.includes(detectedStart)) {
                isEcho = true;
                const avatarStart = normalizedAvatar.substring(0, Math.min(60, normalizedAvatar.length));
                console.log(`🚫 Detected echo - detected text is substring of avatar speech: "${detectedStart}..." found in "${avatarStart}..."`);
                this.clearAccumulatedText(); // Clear echo immediately
                return; // Ignore echo
              }
              
              // Also check reverse - if avatar speech start appears in detected text
              const avatarStart = normalizedAvatar.substring(0, Math.min(60, normalizedAvatar.length));
              if (normalizedDetected.includes(avatarStart)) {
                isEcho = true;
                console.log(`🚫 Detected echo - avatar speech start found in detected text: "${avatarStart}..." found in "${detectedStart}..."`);
                this.clearAccumulatedText(); // Clear echo immediately
                return; // Ignore echo
              }
              
              // Additional check: if any significant portion (15+ chars) of detected text appears in avatar speech
              if (normalizedDetected.length >= 15) {
                for (let i = 0; i <= normalizedDetected.length - 15; i++) {
                  const segment = normalizedDetected.substring(i, i + 15);
                  if (normalizedAvatar.includes(segment)) {
                    isEcho = true;
                    console.log(`🚫 Detected echo - significant segment found in avatar speech: "${segment}" from "${detectedStart}..."`);
                    this.clearAccumulatedText(); // Clear echo immediately
                    return; // Ignore echo
                  }
                }
              }
            }
          }
          
          console.log(`🎤 Audio detected while avatar speaking - accumulated: "${this.accumulatedText}"`);
          
          // CRITICAL: Require substantial text to prevent false interrupts, but allow shorter phrases after protection period
          // After protection period (6s), allow shorter interruptions to catch commands like "shut up", "stop", etc.
          const wordCount = this.accumulatedText.trim().split(/\s+/).filter(w => w.length > 0).length;
          
          // Use different thresholds based on how long avatar has been speaking
          // After protection period, allow shorter interruptions (like "shut up", "stop")
          const MIN_CHARS_FOR_INTERRUPT = timeSinceAvatarStarted >= 6000 ? 10 : 50; // Lower threshold after protection period
          const MIN_WORDS_FOR_INTERRUPT = timeSinceAvatarStarted >= 6000 ? 2 : 8; // Lower threshold after protection period
          const MIN_INTERRUPT_DELAY_MS = 2000; // Reduced from 4000ms to 2000ms (2 seconds) to allow faster interruptions
          
          const isSubstantial = this.accumulatedText.trim().length >= MIN_CHARS_FOR_INTERRUPT && wordCount >= MIN_WORDS_FOR_INTERRUPT;
          
          // If substantial AND enough time has passed since avatar started (to avoid immediate echo), treat as interrupt
          // BUT: Only if we haven't detected it as echo
          // CRITICAL: If echo was detected, always ignore regardless of thresholds
          if (!isEcho && isSubstantial && timeSinceAvatarStarted > MIN_INTERRUPT_DELAY_MS) {
            console.log(`✅ Substantial user speech detected during avatar speech (${this.accumulatedText.trim().length} chars, ${wordCount} words) - treating as interruption`);
            this.userInterruptedAvatar = true;
            this.hasPreservedUserSpeech = true;
            // COMMENTED OUT: Process the interruption immediately
            // After interruption, avatar should wait for user to speak another utterance
            // const textToProcess = this.accumulatedText.trim();
            // this.accumulatedText = ''; // Clear before processing
            // Call onResult to trigger interrupt handling
            // this.onResult(textToProcess);
            // Keep accumulated text for when user speaks again
            console.log('🛑 Interruption detected - avatar will stop and wait for next user utterance');
            return; // Don't continue to normal processing
          } else {
            // Not substantial yet or too soon - likely echo, but keep accumulating
            if (!isEcho) {
            console.log(`⚠️ Audio detected but not substantial enough yet (${this.accumulatedText.trim().length} chars, ${wordCount} words, ${timeSinceAvatarStarted}ms since avatar started) - continuing to accumulate`);
            }
            // Continue accumulating, but don't process yet
            // We'll process it if it becomes substantial
            return;
          }
        } else {
          // No new text - ignore
          return;
        }
      }
      
      // CRITICAL: If resuming, we're in grace period - ignore ALL results to prevent echo
      // This is stricter than the grace period check below because we're actively waiting
      // BUT: If user already interrupted, allow processing their speech
      if (this.isResuming) {
        if (this.userInterruptedAvatar && this.hasPreservedUserSpeech) {
          // User interrupted - allow processing their speech even during grace period
          console.log('✅ Processing user interruption during grace period');
          // Don't return - continue to process
        } else {
          console.log('🚫 Ignoring result while resuming (in grace period) - this is avatar echo, not user speech');
          // Don't clear accumulated text if user interrupted - preserve it
          if (!this.userInterruptedAvatar && !this.hasPreservedUserSpeech) {
            this.clearAccumulatedText();
          }
          return; // Don't process anything during grace period
        }
      }
      
      // CRITICAL: Check if we're in a grace period after avatar stopped speaking
      // This prevents tail-end echo from being processed
      // BUT: If user just interrupted avatar, disable grace period for active user speech
      // CRITICAL: If avatarSpeechEndTime is 0, avatar is currently speaking, so don't apply grace period
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = this.avatarSpeechEndTime > 0 && timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      // CRITICAL: If in grace period and we have avatar speech text, check for echo before processing
      // This prevents echo from being processed even after avatar stops speaking
      if (isInGracePeriod && this.currentAvatarSpeech.length > 0 && !this.userInterruptedAvatar) {
        // Quick echo check: if detected text matches avatar speech, ignore it
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        const detectedText = (finalTranscript + interimTranscript + this.accumulatedText).toLowerCase().trim();
        const normalizedDetected = detectedText
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const normalizedAvatar = this.currentAvatarSpeech
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Check if detected text is similar to avatar speech (echo detection)
        if (normalizedAvatar.length > 0 && normalizedDetected.length > 0) {
          const detectedWords = normalizedDetected.split(/\s+/).filter(w => w.length > 2);
          const avatarWords = normalizedAvatar.split(/\s+/).filter(w => w.length > 2);
          const matchingWords = detectedWords.filter(w => avatarWords.includes(w));
          
          // If 2+ words match, it's likely echo
          if (matchingWords.length >= 2 || normalizedAvatar.includes(normalizedDetected.substring(0, 15)) || normalizedDetected.includes(normalizedAvatar.substring(0, 15))) {
            console.log(`🚫 Ignoring echo in grace period after avatar stopped: "${detectedText.substring(0, 50)}..." matches avatar speech`);
            this.clearAccumulatedText();
            return; // Ignore echo
          }
        }
      }
      
      // Only apply grace period if:
      // 1. User didn't actively interrupt (to allow their speech to be captured)
      // 2. Avatar is NOT currently speaking (avatarSpeechEndTime > 0 means avatar has stopped)
      // 3. We're actually in the grace period time window
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
          // BUT: Only if avatar is NOT currently speaking (not suspended)
          if (!this.isSuspended && this.avatarSpeechEndTime > 0) {
            console.log(`✅ Active user speech detected during grace period - capturing (${timeSinceAvatarEnded}ms after avatar stopped)`);
            this.userInterruptedAvatar = true; // Mark that user is actively speaking
          } else {
            // Avatar is speaking - this is echo, ignore it completely
            console.log(`🚫 Ignoring speech during grace period - avatar is speaking (suspended or avatarSpeechEndTime=0), this is echo`);
            this.clearAccumulatedText();
            return;
          }
        }
      }

      let interimTranscript = '';
      let finalTranscript = '';
      
      // Process all results to accumulate speech
      // CRITICAL: Only process NEW results (from resultIndex onwards) to avoid duplicates
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update accumulated text with final results
      // CRITICAL: Only add NEW final transcript if it's not already in accumulated text
      // This prevents duplicate accumulation when multiple events fire
      if (finalTranscript.trim().length > 0) {
        // Check if this final transcript is already in accumulated text
        const finalTrimmed = finalTranscript.trim();
        if (!this.accumulatedText.includes(finalTrimmed)) {
          // Only add if it's new text
          this.accumulatedText += finalTranscript;
          console.log('Final transcript added:', finalTranscript);
        } else {
          console.log('⚠️ Skipping duplicate final transcript:', finalTrimmed);
        }
        console.log('Accumulated text so far:', this.accumulatedText);
        
        // CRITICAL: Final echo check before processing - even if not in grace period, check if it matches avatar speech
        // This catches echo that might have slipped through other checks
        if (this.currentAvatarSpeech.length > 0 && !this.userInterruptedAvatar) {
          const accumulatedNormalized = this.accumulatedText.toLowerCase().trim()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const avatarNormalized = this.currentAvatarSpeech
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (avatarNormalized.length > 0 && accumulatedNormalized.length > 0) {
            const accumulatedWords = accumulatedNormalized.split(/\s+/).filter(w => w.length > 2);
            const avatarWords = avatarNormalized.split(/\s+/).filter(w => w.length > 2);
            const matchingWords = accumulatedWords.filter(w => avatarWords.includes(w));
            
            // If 2+ words match or significant overlap, it's likely echo
            if (matchingWords.length >= 2 || 
                (matchingWords.length >= 1 && matchingWords.length / Math.max(accumulatedWords.length, avatarWords.length) > 0.2) ||
                avatarNormalized.includes(accumulatedNormalized.substring(0, 15)) ||
                accumulatedNormalized.includes(avatarNormalized.substring(0, 15))) {
              console.log(`🚫 Final echo check - detected text matches avatar speech, ignoring: "${accumulatedNormalized.substring(0, 50)}..."`);
              this.clearAccumulatedText();
              return; // Ignore echo
            }
          }
        }
        
        // CRITICAL: If user interrupted avatar, process speech more aggressively
        // Check if the sentence seems complete (ends with punctuation or pause)
        // OR if user interrupted and we have enough text (process immediately)
        const shouldProcess = this.isSentenceComplete(this.accumulatedText) || 
                              (this.userInterruptedAvatar && this.accumulatedText.trim().length > 5);
        
          if (shouldProcess) {
            console.log('Sentence complete or user interrupted with sufficient text, processing:', this.accumulatedText);
            // CRITICAL: Clean duplicate words before processing
            const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
            console.log('Cleaned text (removed duplicates):', cleanedText);
            const textToProcess = cleanedText;
            // CRITICAL: Clear accumulated text and flags BEFORE calling onResult
            // This prevents double processing if onResult triggers processPendingSpeech
            this.accumulatedText = '';
            this.hasPreservedUserSpeech = false; // Clear preserved flag after processing
            this.userInterruptedAvatar = false; // Clear interruption flag after processing
            // Clear timeout since we're processing now
            if (this.speechTimeout) {
              clearTimeout(this.speechTimeout);
              this.speechTimeout = null;
            }
            // Process the speech
            this.onResult(textToProcess);
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
          // CRITICAL: If suspended, avatar is speaking - don't process anything
          const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
          const isInGracePeriod = this.avatarSpeechEndTime > 0 && timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
          
          // If we have preserved user speech (from interruption), always process it regardless of grace period
          // OR if user just interrupted avatar (active speech after interruption)
          if ((this.hasPreservedUserSpeech || this.userInterruptedAvatar) && this.accumulatedText.trim().length > 0) {
            console.log('Speech timeout reached, processing user speech after interruption:', this.accumulatedText);
            // Clean duplicate words before processing
            const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
            console.log('Cleaned text (removed duplicates):', cleanedText);
            const textToProcess = cleanedText;
            // Clear BEFORE processing to prevent double processing
            this.accumulatedText = '';
            this.hasPreservedUserSpeech = false; // Clear flag after processing
            this.userInterruptedAvatar = false; // Clear interruption flag
            this.onResult(textToProcess);
          } else if (!this.isSuspended && !isInGracePeriod && this.accumulatedText.trim().length > 0) {
            console.log('Speech timeout reached, processing accumulated text:', this.accumulatedText);
            // Clean duplicate words before processing
            const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
            console.log('Cleaned text (removed duplicates):', cleanedText);
            const textToProcess = cleanedText;
            // Clear BEFORE processing
            this.accumulatedText = '';
            this.onResult(textToProcess);
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
      
      // Auto-restart for recoverable errors (only if not suspended, resuming, or in grace period)
      if (shouldRestart && !this.isSuspended && !this.isResuming && !this.isInGracePeriod()) {
        setTimeout(() => {
          if (!this.isListening && !this.isSuspended && !this.isResuming && !this.isInGracePeriod()) {
            console.log('Auto-restarting speech recognition after error...');
            this.startListening().catch(console.error);
          } else {
            console.log('⚠️ Skipping auto-restart after error - suspended, resuming, or in grace period');
          }
        }, 1000);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      console.log('Speech recognition ended');
      
      // CRITICAL: If suspended or resuming, avatar is speaking or in grace period - don't process anything and don't restart
      // The resume() method will restart it after avatar stops (with grace period)
      if (this.isSuspended || this.isResuming) {
        console.log('🚫 Recognition ended while suspended or resuming (avatar speaking or in grace period) - not restarting or processing');
        // Don't clear accumulated text if user interrupted - preserve it
        if (!this.userInterruptedAvatar && !this.hasPreservedUserSpeech) {
          this.clearAccumulatedText();
        }
        return; // Don't restart or process anything while avatar is speaking or in grace period
      }
      
      // CRITICAL: Only process accumulated text if we're not in grace period
      // UNLESS we have preserved user speech or user interrupted, in which case always process it
      // CRITICAL: If avatarSpeechEndTime is 0, avatar is currently speaking, so don't process
      // CRITICAL: If suspended, avatar is speaking, so don't process
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = this.avatarSpeechEndTime > 0 && timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      // If we have preserved user speech OR user just interrupted, always process it regardless of grace period
      if ((this.hasPreservedUserSpeech || this.userInterruptedAvatar) && this.accumulatedText.trim().length > 0) {
        console.log('Processing user speech on end (after interruption):', this.accumulatedText);
        // Clean duplicate words before processing
        const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
        console.log('Cleaned text (removed duplicates):', cleanedText);
        const textToProcess = cleanedText;
        // Clear BEFORE processing to prevent double processing
        this.accumulatedText = '';
        this.hasPreservedUserSpeech = false;
        this.userInterruptedAvatar = false;
        this.onResult(textToProcess);
      } else if (!isInGracePeriod && this.accumulatedText.trim().length > 0) {
        console.log('Processing remaining accumulated text on end:', this.accumulatedText);
        // Clean duplicate words before processing
        const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
        console.log('Cleaned text (removed duplicates):', cleanedText);
        const textToProcess = cleanedText;
        // Clear BEFORE processing
        this.accumulatedText = '';
        this.onResult(textToProcess);
      } else {
        // Clear accumulated text if in grace period (and not preserved/interrupted)
        if (isInGracePeriod && !this.hasPreservedUserSpeech && !this.userInterruptedAvatar) {
          console.log('Clearing accumulated text on end (grace period)');
          this.clearAccumulatedText();
        }
      }
      
      // Automatically restart listening after a short delay (only if not suspended or resuming)
      setTimeout(() => {
        // CRITICAL: Don't restart if suspended, resuming, or in grace period
        if (!this.isListening && !this.isSuspended && !this.isResuming && !this.isInGracePeriod()) {
          console.log('Auto-restarting speech recognition from onend...');
          this.startListening().catch((error) => {
            console.error('Failed to restart speech recognition:', error);
            // Try again after a longer delay if restart fails
            setTimeout(() => {
              if (!this.isListening && !this.isSuspended && !this.isResuming && !this.isInGracePeriod()) {
                this.startListening().catch(console.error);
              }
            }, 3000);
          });
        } else {
          if (this.isSuspended || this.isResuming || this.isInGracePeriod()) {
            console.log('⚠️ Skipping auto-restart from onend - suspended, resuming, or in grace period');
          }
        }
      }, 500); // Shorter delay for faster restart
    };
  }

  public async startListening(): Promise<void> {
    // CRITICAL: Don't start if we're in grace period or suspended
    if (this.isSuspended || this.isResuming || this.isInGracePeriod()) {
      console.log('⚠️ Cannot start listening - suspended, resuming, or in grace period');
      return;
    }
    
    // CRITICAL: Reinitialize recognition if it doesn't exist
    // After suspend/stop cycles, some browsers invalidate the recognition object
    // So we recreate it to ensure it works properly
    if (!this.recognition) {
      console.log('Recognition object missing, reinitializing...');
      this.initializeRecognition();
    }
    
    // Double-check recognition was created successfully
    if (!this.recognition) {
      console.error('Failed to create recognition object - browser may not support speech recognition');
      return;
    }
    
    if (this.recognition && !this.isListening && !this.isSuspended) {
      try {
        // Stop existing audio stream if it exists (to avoid conflicts)
        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped existing audio track before restarting');
          });
          this.audioStream = null;
        }
        
        // Request microphone permission first with enhanced echo cancellation
        // These settings help prevent avatar's audio output from being picked up
        // Store the stream so we can properly stop it later
        this.audioStream = await navigator.mediaDevices.getUserMedia({
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
    } else if (this.isSuspended) {
      console.log('Speech recognition suspended - will resume automatically');
    } else {
      console.log('Speech recognition not available', {
        hasRecognition: !!this.recognition,
        isListening: this.isListening,
        isSuspended: this.isSuspended
      });
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
    // Stop the audio stream to release the microphone
    // This is critical on iOS where active media streams block video recording
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped audio track from speech recognition');
      });
      this.audioStream = null;
    }
  }

  // Temporarily suspend recognition and prevent auto-restarts/results
  // CRITICAL: Keep recognition running but mark as suspended so we can detect user interruptions
  // We filter results carefully to distinguish user speech from avatar echo
  public suspend(avatarSpeechText?: string): void {
    // CRITICAL: Set suspended flag FIRST to mark that avatar is speaking
    this.isSuspended = true;
    // Record when avatar started speaking to ignore echo/feedback
    this.avatarSpeechStartTime = Date.now();
    // CRITICAL: Clear avatarSpeechEndTime since avatar is now speaking (not stopped)
    // This prevents grace period logic from triggering while avatar is speaking
    this.avatarSpeechEndTime = 0;
    
    // Store current avatar speech text for echo detection
    if (avatarSpeechText) {
      this.setAvatarSpeech(avatarSpeechText);
    }
    
    // CRITICAL: DON'T stop recognition - keep it running so we can detect user interruptions
    // Instead, we'll carefully filter results in onresult to distinguish user speech from echo
    // Clear accumulated text to start fresh (but we'll accumulate new text to detect interruptions)
    this.clearAccumulatedText();
    console.log('🛑 Suspending speech recognition (avatar speaking) - will filter results to detect user interruptions');
    
    // Note: Recognition stays active so we can detect user interruptions
    // The onresult handler will carefully filter to distinguish user speech from echo
  }

  // Resume recognition after suspension
  // Wait for grace period before restarting to avoid capturing tail-end echo
  public resume(): void {
    // Record when avatar stopped speaking for grace period
    this.avatarSpeechEndTime = Date.now();
    // Clear avatar speech start time since avatar is no longer speaking
    this.avatarSpeechStartTime = 0;
    // Clear interruption flag since avatar finished naturally (not interrupted)
    this.userInterruptedAvatar = false;
    // Clear any accumulated text that might contain echo
    this.clearAccumulatedText();
    
    // CRITICAL: Set resuming flag BEFORE clearing suspended flag
    // This prevents force restart from running during grace period
    this.isResuming = true;
    
    // Wait for grace period before restarting to avoid capturing tail-end echo
    // Then restart recognition
    setTimeout(() => {
      // Only clear suspended flag and resume after grace period
      this.isSuspended = false;
      this.isResuming = false;
      
      // Clear avatar speech text after grace period to prevent false positives in future conversations
      // Keep it during grace period for echo detection
      this.currentAvatarSpeech = '';
      console.log('🔄 Cleared avatar speech text after grace period');
      
      if (!this.isSuspended && !this.isListening) {
        console.log('🔄 Resuming speech recognition after avatar stopped (grace period passed)');
        // CRITICAL: Always reinitialize recognition after suspend/resume cycle
        // Some browsers invalidate the recognition object after stop(), so we recreate it
        console.log('Reinitializing recognition object after resume...');
        this.initializeRecognition();
        this.startListening().catch(console.error);
      }
    }, this.POST_AVATAR_GRACE_PERIOD_MS);
  }

  // Force clear suspension - used when user interrupts avatar
  // Immediately clears suspension and restarts recognition to capture user's speech
  public forceResume(): void {
    this.isSuspended = false;
    this.isResuming = false; // Clear resuming flag since we're force resuming
    // Mark that user actively interrupted avatar - this disables grace period for active speech
    this.userInterruptedAvatar = true;
    // Record when avatar was interrupted for grace period
    this.avatarSpeechEndTime = Date.now();
    
    // CRITICAL: DON'T clear accumulated text here - user might have already started speaking
    // The accumulated text might contain the user's speech that triggered the interrupt
    // We'll preserve it and process it once the user finishes speaking
    // Only clear if it's very short (likely echo/noise)
    const currentAccumulated = this.accumulatedText.trim();
    if (currentAccumulated.length > 0 && currentAccumulated.length < 3) {
      // Very short text is likely echo, clear it
      console.log('Clearing very short accumulated text (likely echo):', currentAccumulated);
      this.clearAccumulatedText();
    } else if (currentAccumulated.length > 0) {
      // Preserve user's speech - mark it as preserved
      console.log('✅ Preserving user speech during interrupt:', currentAccumulated);
      this.hasPreservedUserSpeech = true;
    }
    
    // Clear avatar speech start time since avatar was interrupted
    this.avatarSpeechStartTime = 0;
    
    // Immediately restart recognition to capture user's ongoing speech
    // Recognition was stopped when suspended, so we need to start it again
    console.log('🔄 Force resuming speech recognition - user interrupted avatar');
    // CRITICAL: Always reinitialize recognition after suspend/resume cycle
    // Some browsers invalidate the recognition object after stop(), so we recreate it
    console.log('Reinitializing recognition object after forceResume...');
    this.initializeRecognition();
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
    // CRITICAL: Don't force restart if we're in grace period (waiting for resume)
    // This prevents restarting while avatar's echo might still be present
    if (this.isResuming || this.isSuspended) {
      const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
      const isInGracePeriod = this.avatarSpeechEndTime > 0 && timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
      
      if (isInGracePeriod || this.isSuspended) {
        console.log('⚠️ Skipping force restart - in grace period or suspended (avatar speaking/just finished)');
        return;
      }
    }
    
    console.log('Force restarting speech recognition...');
    this.isListening = false;
    this.isSuspended = false; // Clear suspension flag when force restarting
    this.isResuming = false; // Clear resuming flag
    // CRITICAL: Always reinitialize recognition when force restarting
    // This ensures the recognition object is fresh and valid
    console.log('Reinitializing recognition object for force restart...');
    this.initializeRecognition();
    this.startListening().catch(console.error);
  }
  
  // Check if we're currently in a grace period or waiting to resume
  public isInGracePeriod(): boolean {
    if (this.isSuspended || this.isResuming) {
      return true;
    }
    
    const timeSinceAvatarEnded = this.avatarSpeechEndTime > 0 ? Date.now() - this.avatarSpeechEndTime : Infinity;
    return this.avatarSpeechEndTime > 0 && timeSinceAvatarEnded < this.POST_AVATAR_GRACE_PERIOD_MS;
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

  // Clean up duplicate word sequences in accumulated text
  private cleanDuplicateWords(text: string): string {
    if (!text || text.trim().length === 0) return text;
    
    // First pass: Remove patterns like "yesyes", "tellyes", "tell meyes", etc.
    // These are concatenated duplicates from interim results
    let cleaned = text;
    
    // Pattern: repeated words like "yesyes", "telltell", etc.
    cleaned = cleaned.replace(/\b(\w+)\1+\b/gi, '$1');
    
    // Pattern: word ending with previous word like "tellyes" when we already have "tell"
    // This is harder to detect, so we'll handle it in the word-by-word pass below
    
    // Second pass: Split into words and filter out duplicates
    const words = cleaned.split(/\s+/);
    const cleanedWords: string[] = [];
    let lastWord = '';
    
    for (let i = 0; i < words.length; i++) {
      let word = words[i].trim();
      if (word.length === 0) continue;
      
      // Remove duplicate patterns within the word itself (e.g., "yesyes" -> "yes")
      word = word.replace(/\b(\w+)\1+\b/gi, '$1');
      
      // Check if word ends with previous word (e.g., "tellyes" when lastWord is "tell")
      if (lastWord && word.toLowerCase().endsWith(lastWord.toLowerCase()) && word.length > lastWord.length) {
        // Extract the new part
        const newPart = word.substring(0, word.length - lastWord.length).trim();
        if (newPart.length > 0) {
          cleanedWords.push(newPart);
          lastWord = newPart;
        } else {
          // If extracting new part leaves nothing, just skip this word (it's a duplicate)
          continue;
        }
      } else if (word !== lastWord) {
        // Only add if it's different from last word
        cleanedWords.push(word);
        lastWord = word;
      }
    }
    
    return cleanedWords.join(' ');
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
    // CRITICAL: Don't process if we're suspended (avatar is speaking) - this prevents processing stale speech
    if (this.isSuspended) {
      console.log('⚠️ Skipping processPendingSpeech - avatar is speaking (suspended)');
      return;
    }
    
    // CRITICAL: Only process if we have meaningful accumulated text
    if (this.accumulatedText.trim().length === 0) {
      console.log('⚠️ Skipping processPendingSpeech - no accumulated text to process');
      return;
    }
    
    // Process if user interrupted OR if we have preserved speech
    if (this.userInterruptedAvatar || this.hasPreservedUserSpeech) {
      console.log('✅ Force processing pending user speech after avatar stopped:', this.accumulatedText);
      // Clean duplicate words before processing
      const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
      console.log('Cleaned text (removed duplicates):', cleanedText);
      const textToProcess = cleanedText;
      // Clear accumulated text BEFORE processing to prevent double processing
      this.accumulatedText = '';
      this.hasPreservedUserSpeech = false;
      this.userInterruptedAvatar = false;
      // Clear any pending timeout since we're processing now
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
        this.speechTimeout = null;
      }
      // Process the speech
      this.onResult(textToProcess);
    } else if (this.accumulatedText.trim().length > 5) {
      // Only process if we have substantial text (more than 5 chars) to avoid processing noise
      console.log('Processing accumulated text after interrupt (no flags set but substantial text):', this.accumulatedText);
      // Clean duplicate words before processing
      const cleanedText = this.cleanDuplicateWords(this.accumulatedText.trim());
      console.log('Cleaned text (removed duplicates):', cleanedText);
      const textToProcess = cleanedText;
      // Clear accumulated text BEFORE processing
      this.accumulatedText = '';
      this.hasPreservedUserSpeech = false;
      this.userInterruptedAvatar = false;
      // Process the speech
      this.onResult(textToProcess);
    } else {
      // Clear small accumulated text as it's likely noise
      console.log('Clearing small accumulated text (likely noise):', this.accumulatedText);
      this.clearAccumulatedText();
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

