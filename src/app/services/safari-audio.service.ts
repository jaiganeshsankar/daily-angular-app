import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SafariAudioService {
  private audioContext: AudioContext | null = null;
  private isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  private resumeInterval: any;
  private userInteractionDetected = false;

  constructor() {
    if (this.isSafari) {
      this.initializeAudioContext();
      this.setupUserInteractionDetection();
    }
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('🎵 Safari AudioContext initialized globally:', this.audioContext.state);
      
      // Set up periodic monitoring
      this.resumeInterval = setInterval(() => {
        this.checkAndResumeAudioContext();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to initialize global Safari AudioContext:', error);
    }
  }

  private setupUserInteractionDetection(): void {
    const detectInteraction = () => {
      if (!this.userInteractionDetected) {
        this.userInteractionDetected = true;
        console.log('🎯 User interaction detected - Safari AudioContext can now be resumed');
        this.resumeAudioContext();
      }
    };

    // Listen for various user interactions
    document.addEventListener('click', detectInteraction, { once: true });
    document.addEventListener('touchstart', detectInteraction, { once: true });
    document.addEventListener('keydown', detectInteraction, { once: true });
  }

  private checkAndResumeAudioContext(): void {
    if (!this.audioContext) {
      // Reinitialize if AudioContext was lost
      this.initializeAudioContext();
      return;
    }

    if (this.audioContext.state === 'suspended') {
      console.warn('🚨 Global Safari AudioContext suspended, attempting to resume...');
      this.resumeAudioContext();
    } else if (this.audioContext.state === 'closed') {
      // AudioContext was closed, reinitialize
      console.warn('🚨 Global Safari AudioContext closed, reinitializing...');
      this.audioContext = null;
      this.initializeAudioContext();
    }
  }

  public resumeAudioContext(): Promise<void> {
    if (!this.isSafari || !this.audioContext) {
      return Promise.resolve();
    }

    if (this.audioContext.state === 'suspended') {
      return this.audioContext.resume().then(() => {
        console.log('✅ Global Safari AudioContext resumed successfully');
        // Reconnect all audio streams after resume
        setTimeout(() => {
          this.forceReconnectAllAudio();
        }, 100);
      }).catch(error => {
        console.warn('Failed to resume global Safari AudioContext:', error);
        throw error;
      });
    }

    return Promise.resolve();
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public isAudioContextRunning(): boolean {
    return this.audioContext ? this.audioContext.state === 'running' : false;
  }

  public isSafariBrowser(): boolean {
    return this.isSafari;
  }

  public hasUserInteracted(): boolean {
    return this.userInteractionDetected;
  }

  public connectMediaStreamToContext(mediaStream: MediaStream): MediaStreamAudioSourceNode | null {
    if (!this.isSafari || !this.audioContext || !mediaStream) {
      return null;
    }

    try {
      // Ensure AudioContext is running before connecting
      if (this.audioContext.state !== 'running') {
        this.resumeAudioContext();
      }

      const source = this.audioContext.createMediaStreamSource(mediaStream);
      
      // Create a gain node to ensure audio flows through
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      
      // Connect: source -> gain -> destination
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      console.log('🔗 Connected MediaStream to global Safari AudioContext with gain node');
      return source;
    } catch (error) {
      console.warn('Failed to connect MediaStream to AudioContext:', error);
      return null;
    }
  }

  public forceReconnectAllAudio(): void {
    if (!this.isSafari) return;
    
    // Find all audio elements and reconnect their MediaStreams
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach((audioEl: any) => {
      if (audioEl.srcObject) {
        try {
          this.connectMediaStreamToContext(audioEl.srcObject);
          // Force audio to resume playing
          if (audioEl.paused && this.userInteractionDetected) {
            audioEl.play().catch(() => {/* Ignore failures */});
          }
        } catch (error) {
          console.warn('Failed to reconnect audio stream:', error);
        }
      }
    });
  }

  public destroy(): void {
    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}