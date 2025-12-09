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
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.warn('🚨 Global Safari AudioContext suspended, attempting to resume...');
      this.resumeAudioContext();
    }
  }

  public resumeAudioContext(): Promise<void> {
    if (!this.isSafari || !this.audioContext) {
      return Promise.resolve();
    }

    if (this.audioContext.state === 'suspended') {
      return this.audioContext.resume().then(() => {
        console.log('✅ Global Safari AudioContext resumed successfully');
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
      const source = this.audioContext.createMediaStreamSource(mediaStream);
      console.log('🔗 Connected MediaStream to global Safari AudioContext');
      return source;
    } catch (error) {
      console.warn('Failed to connect MediaStream to AudioContext:', error);
      return null;
    }
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