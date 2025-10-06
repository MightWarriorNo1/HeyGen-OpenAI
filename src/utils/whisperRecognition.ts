// OpenAI Whisper-based speech recognition utility
export class WhisperRecognitionService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isListening: boolean = false;
  private onResult: (text: string) => void;
  private onError: (error: string) => void;
  private openai: any;
  private stream: MediaStream | null = null;
  private recordingTimeout: any = null;
  private accumulatedText: string = '';
  private speechTimeout: any = null;

  constructor(onResult: (text: string) => void, onError: (error: string) => void, openai: any) {
    this.onResult = onResult;
    this.onError = onError;
    this.openai = openai;
  }

  public async startListening(): Promise<void> {
    if (this.isListening) {
      console.log('Already listening');
      return;
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isListening = true;

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.processAudio();
      };

      // Start recording
      this.mediaRecorder.start(1000); // Record in 1-second chunks

      // Set up timeout to stop recording after silence
      this.setupRecordingTimeout();

      console.log('Whisper recognition started');

    } catch (error: any) {
      console.error('Error starting Whisper recognition:', error);
      this.isListening = false;
      
      if (error.name === 'NotAllowedError') {
        this.onError('Microphone access denied. Please allow microphone access and try again.');
      } else if (error.name === 'NotFoundError') {
        this.onError('No microphone found. Please check your microphone connection.');
      } else {
        this.onError('Failed to access microphone. Please check your device settings.');
      }
    }
  }

  public stopListening(): void {
    if (this.mediaRecorder && this.isListening) {
      this.mediaRecorder.stop();
      this.isListening = false;
      this.clearTimeouts();
    }
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public forceRestart(): void {
    console.log('Force restarting Whisper recognition...');
    this.stopListening();
    setTimeout(() => {
      this.startListening().catch(console.error);
    }, 500);
  }

  public clearAccumulatedText(): void {
    this.accumulatedText = '';
    this.clearTimeouts();
  }

  private setupRecordingTimeout(): void {
    // Clear any existing timeout
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
    }

    // Set timeout to stop recording after 3 seconds of silence
    this.recordingTimeout = setTimeout(() => {
      if (this.isListening && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        console.log('Recording timeout reached, processing audio...');
        this.mediaRecorder.stop();
      }
    }, 3000);
  }

  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      console.log('No audio data to process');
      this.restartListening();
      return;
    }

    try {
      // Create audio blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
      // Check if audio has meaningful content (not just silence)
      if (audioBlob.size < 1000) { // Less than 1KB is likely silence
        console.log('Audio too short, likely silence');
        this.restartListening();
        return;
      }

      // Create FormData for OpenAI API
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      console.log('Sending audio to Whisper API...');

      // Call OpenAI Whisper API
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openai.apiKey}`,
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const transcript = result.text?.trim();

      if (transcript && transcript.length > 0) {
        console.log('Whisper transcript:', transcript);
        
        // Accumulate text and check for sentence completion
        this.accumulatedText += transcript + ' ';
        
        if (this.isSentenceComplete(this.accumulatedText)) {
          console.log('Sentence complete, processing:', this.accumulatedText.trim());
          this.onResult(this.accumulatedText.trim());
          this.accumulatedText = '';
        } else {
          // Set timeout to process accumulated text if user stops speaking
          this.speechTimeout = setTimeout(() => {
            if (this.accumulatedText.trim().length > 0) {
              console.log('Speech timeout reached, processing accumulated text:', this.accumulatedText.trim());
              this.onResult(this.accumulatedText.trim());
              this.accumulatedText = '';
            }
          }, 2000);
        }
      } else {
        console.log('No speech detected in audio');
      }

    } catch (error: any) {
      console.error('Error processing audio with Whisper:', error);
      this.onError(`Speech recognition error: ${error.message}`);
    } finally {
      // Clear audio chunks for next recording
      this.audioChunks = [];
      
      // Restart listening
      this.restartListening();
    }
  }

  private restartListening(): void {
    if (this.isListening) {
      setTimeout(() => {
        if (this.isListening) {
          this.startListening().catch(console.error);
        }
      }, 500);
    }
  }

  private clearTimeouts(): void {
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
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

  public cleanup(): void {
    this.stopListening();
    this.clearTimeouts();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}
