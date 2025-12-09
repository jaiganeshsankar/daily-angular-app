import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  SimpleChanges,
} from "@angular/core";
import { SafariAudioService } from '../services/safari-audio.service';

@Component({
  selector: "video-tile",
  templateUrl: "./video-tile.component.html",
  styleUrls: ["./video-tile.component.css"],
})
export class VideoTileComponent {
  constructor(
    private elementRef: ElementRef,
    private safariAudioService: SafariAudioService
  ) {}
  @Input() joined: boolean;
  @Input() videoReady: boolean;
  @Input() audioReady: boolean;
  @Input() screenVideoReady: boolean;
  @Input() screenAudioReady: boolean;
  @Input() local: boolean;
  @Input() userName: string;
  @Input() videoTrack: MediaStreamTrack | undefined;
  @Input() audioTrack: MediaStreamTrack | undefined;
  @Input() screenVideoTrack: MediaStreamTrack | undefined;
  @Input() screenAudioTrack: MediaStreamTrack | undefined;
  @Input() isScreenSharing: boolean;
  @Input() sidebarView: boolean = false;
  @Input() screenShareView: boolean = false;
  @Input() role: 'backstage' | 'stage';
  @Input() screenSharingParticipant: any = null; // **NEW INPUT**
  @Input() hideControls: boolean = false;

  videoStream: MediaStream | undefined;
  audioStream: MediaStream | undefined;
  screenVideoStream: MediaStream | undefined;
  screenAudioStream: MediaStream | undefined;

  @Output() leaveCallClick: EventEmitter<null> = new EventEmitter();
  @Output() toggleVideoClick: EventEmitter<null> = new EventEmitter();
  @Output() toggleAudioClick: EventEmitter<null> = new EventEmitter();
  @Output() toggleScreenShareClick: EventEmitter<null> = new EventEmitter();
  @Output() toggleVirtualBgClick: EventEmitter<null> = new EventEmitter();
  @Output() roleChangeClick: EventEmitter<null> = new EventEmitter();

  // If there's a video/audio/screen track on init, create a MediaStream for it.
  ngOnInit(): void {
    if (this.videoTrack) {
      this.addVideoStream(this.videoTrack);
    }
    if (this.audioTrack) {
      this.addAudioStream(this.audioTrack);
    }
    if (this.screenVideoTrack) {
      this.addScreenVideoStream(this.screenVideoTrack);
    }
    if (this.screenAudioTrack) {
      this.addScreenAudioStream(this.screenAudioTrack);
    }

    // Set up periodic audio monitoring for non-local participants
    if (!this.local) {
      this.startAudioMonitoring();
    }
  }

  ngOnDestroy(): void {
    if (this.audioMonitorInterval) {
      clearInterval(this.audioMonitorInterval);
    }
  }

  private audioMonitorInterval: any;

  private startAudioMonitoring(): void {
    // Check audio state every 2 seconds
    this.audioMonitorInterval = setInterval(() => {
      if (!this.local) {
        this.checkAndFixAudioPlayback();
      }
    }, 2000);
  }

  private checkAndFixAudioPlayback(): void {
    // Check participant audio
    if (this.audioStream && this.audioReady) {
      const audioEl = this.elementRef.nativeElement.querySelector('audio.participant-audio') as HTMLAudioElement;
      if (audioEl && audioEl.paused && audioEl.srcObject) {
        console.warn(`🚨 Detected paused audio for ${this.userName}, attempting to resume...`);
        this.forceAudioPlay('audio');
      }
    }

    // Check screen audio
    if (this.screenAudioStream && this.screenAudioReady) {
      const screenAudioEl = this.elementRef.nativeElement.querySelector('audio.screen-audio') as HTMLAudioElement;
      if (screenAudioEl && screenAudioEl.paused && screenAudioEl.srcObject) {
        console.warn(`🚨 Detected paused screen audio for ${this.userName}, attempting to resume...`);
        this.forceAudioPlay('screenAudio');
      }
    }
  }

  /**
   * Changes that require updates include:
   * - Creating a video/audio/screen stream for the first time
   * - Replacing the video/audio/screen *track* for an existing stream
   */
  ngOnChanges(changes: SimpleChanges): void {
    const { videoTrack, audioTrack, screenVideoTrack, screenAudioTrack } = changes;

    // Handle video track changes
    if (videoTrack?.currentValue && !this.videoStream) {
      this.addVideoStream(videoTrack.currentValue);
    }
    if (videoTrack?.currentValue && this.videoStream) {
      this.updateVideoTrack(videoTrack.previousValue, videoTrack.currentValue);
    }

    // Handle audio track changes
    if (audioTrack?.currentValue && !this.audioStream) {
      this.addAudioStream(audioTrack.currentValue);
      // Force audio play after DOM updates for non-Chromium browsers
      if (!this.local) {
        setTimeout(() => this.forceAudioPlay('audio'), 0);
      }
    }
    if (audioTrack?.currentValue && this.audioStream) {
      this.updateAudioTrack(audioTrack.previousValue, audioTrack.currentValue);
      // Force audio play after track update
      if (!this.local) {
        setTimeout(() => this.forceAudioPlay('audio'), 0);
      }
    }

    // Handle screen video track changes
    if (screenVideoTrack?.currentValue && !this.screenVideoStream) {
      this.addScreenVideoStream(screenVideoTrack.currentValue);
    }
    if (screenVideoTrack?.currentValue && this.screenVideoStream) {
      this.updateScreenVideoTrack(screenVideoTrack.previousValue, screenVideoTrack.currentValue);
    }

    // Handle screen audio track changes
    if (screenAudioTrack?.currentValue && !this.screenAudioStream) {
      this.addScreenAudioStream(screenAudioTrack.currentValue);
      // Force screen audio play after DOM updates
      if (!this.local) {
        setTimeout(() => this.forceAudioPlay('screenAudio'), 0);
      }
    }
    if (screenAudioTrack?.currentValue && this.screenAudioStream) {
      this.updateScreenAudioTrack(screenAudioTrack.previousValue, screenAudioTrack.currentValue);
      // Force screen audio play after track update
      if (!this.local) {
        setTimeout(() => this.forceAudioPlay('screenAudio'), 0);
      }
    }
  }

  addVideoStream(track: MediaStreamTrack) {
    this.videoStream = new MediaStream([track]);
  }

  addAudioStream(track: MediaStreamTrack) {
    this.audioStream = new MediaStream([track]);
    console.log('🎵 Audio stream created for participant:', {
      userName: this.userName,
      local: this.local,
      trackId: track.id,
      willPlay: !this.local  // Should only play if not local
    });
  }

  addScreenVideoStream(track: MediaStreamTrack) {
    this.screenVideoStream = new MediaStream([track]);
  }

  addScreenAudioStream(track: MediaStreamTrack) {
    this.screenAudioStream = new MediaStream([track]);
  }

  updateVideoTrack(oldTrack: MediaStreamTrack, track: MediaStreamTrack) {
    if (oldTrack) {
      this.videoStream?.removeTrack(oldTrack);
    }
    this.videoStream?.addTrack(track);
  }

  updateAudioTrack(oldTrack: MediaStreamTrack, track: MediaStreamTrack) {
    if (oldTrack) {
      this.audioStream?.removeTrack(oldTrack);
    }
    this.audioStream?.addTrack(track);
  }

  updateScreenVideoTrack(oldTrack: MediaStreamTrack, track: MediaStreamTrack) {
    if (oldTrack) {
      this.screenVideoStream?.removeTrack(oldTrack);
    }
    this.screenVideoStream?.addTrack(track);
  }

  updateScreenAudioTrack(oldTrack: MediaStreamTrack, track: MediaStreamTrack) {
    if (oldTrack) {
      this.screenAudioStream?.removeTrack(oldTrack);
    }
    this.screenAudioStream?.addTrack(track);
  }

  handleToggleVideoClick(): void {
    this.toggleVideoClick.emit();
  }

  handleToggleAudioClick(): void {
    this.toggleAudioClick.emit();
  }

  handleToggleScreenShareClick(): void {
    this.toggleScreenShareClick.emit();
  }

  handleToggleVirtualBgClick(): void {
    this.toggleVirtualBgClick.emit();
  }

  handleLeaveCallClick(): void {
    this.leaveCallClick.emit();
  }

  handleRoleChangeClick(): void {
    this.roleChangeClick.emit();
  }

  onAudioLoadStart(event: Event): void {
    // When audio element starts loading new content, request volume reapplication
    console.log('Audio loadstart event for', this.userName, '- requesting volume reapplication');
    setTimeout(() => {
      this.requestVolumeReapplication();
      // Also force audio play on loadstart
      if (!this.local) {
        this.forceAudioPlay('audio');
      }
    }, 100);
  }

  onScreenAudioLoadStart(event: Event): void {
    // When screen audio element starts loading new content, request volume reapplication
    console.log('Screen audio loadstart event for', this.userName, '- requesting volume reapplication');
    setTimeout(() => {
      this.requestVolumeReapplication();
      // Also force screen audio play on loadstart
      if (!this.local) {
        this.forceAudioPlay('screenAudio');
      }
    }, 100);
  }

  onAudioCanPlay(event: Event): void {
    // Additional trigger when audio can start playing
    if (!this.local) {
      console.log('Audio canplay event for', this.userName, '- forcing play');
      setTimeout(() => this.forceAudioPlay('audio'), 50);
    }
  }

  onScreenAudioCanPlay(event: Event): void {
    // Additional trigger when screen audio can start playing
    if (!this.local) {
      console.log('Screen audio canplay event for', this.userName, '- forcing play');
      setTimeout(() => this.forceAudioPlay('screenAudio'), 50);
    }
  }

  private requestVolumeReapplication(): void {
    // Emit a custom event that the parent component can listen to
    // This is a cleaner approach than directly calling parent methods
    const event = new CustomEvent('requestVolumeReapplication', {
      detail: { participantId: this.userName },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  private forceAudioPlay(trackType: 'audio' | 'screenAudio'): void {
    // Find the specific audio element for this track
    const selector = trackType === 'audio' ? 'audio.participant-audio' : 'audio.screen-audio';
    const audioEl = this.elementRef.nativeElement.querySelector(selector) as HTMLAudioElement;
    
    if (audioEl) {
      console.log(`🔊 Attempting to force play ${trackType} for ${this.userName}:`, {
        paused: audioEl.paused,
        readyState: audioEl.readyState,
        srcObject: !!audioEl.srcObject,
        audioContextState: this.safariAudioService.isSafariBrowser() ? 
          (this.safariAudioService.isAudioContextRunning() ? 'running' : 'suspended') : 'N/A'
      });
      
      // Safari: Ensure AudioContext is running before playing audio
      if (this.safariAudioService.isSafariBrowser()) {
        this.safariAudioService.resumeAudioContext().then(() => {
          console.log('🎵 Safari AudioContext confirmed running, attempting audio play');
          this.attemptAudioPlay(audioEl, trackType);
          // Connect audio to AudioContext for Safari
          if (audioEl.srcObject) {
            this.safariAudioService.connectMediaStreamToContext(audioEl.srcObject as MediaStream);
          }
        }).catch(() => {
          console.warn('Failed to resume AudioContext, trying audio play anyway');
          this.attemptAudioPlay(audioEl, trackType);
        });
      } else {
        this.attemptAudioPlay(audioEl, trackType);
      }
    } else {
      console.warn(`⚠️ Audio element not found for ${trackType} (participant: ${this.userName})`);
    }
  }

  private attemptAudioPlay(audioEl: HTMLAudioElement, trackType: 'audio' | 'screenAudio'): void {
    // Force play regardless of current state
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log(`✅ Successfully started ${trackType} playback for ${this.userName}`);
        })
        .catch(error => {
          console.warn(`❌ Autoplay failed for ${trackType} (participant: ${this.userName}):`, error.message);
          // Set up user interaction listener for this specific audio element
          this.setupUserInteractionListener(audioEl, trackType);
        });
    }
  }

  private setupUserInteractionListener(audioEl: HTMLAudioElement, trackType: 'audio' | 'screenAudio'): void {
    const playOnInteraction = () => {
      // Safari: Resume AudioContext first using shared service
      if (this.safariAudioService.isSafariBrowser()) {
        this.safariAudioService.resumeAudioContext().then(() => {
          console.log('🎵 Safari AudioContext resumed via shared service');
          this.attemptAudioPlay(audioEl, trackType);
        }).catch(() => {
          this.attemptAudioPlay(audioEl, trackType);
        });
      } else {
        this.attemptAudioPlay(audioEl, trackType);
      }
      
      // Remove listeners after first successful interaction
      document.removeEventListener('click', playOnInteraction);
      document.removeEventListener('touchstart', playOnInteraction);
      document.removeEventListener('keydown', playOnInteraction);
    };

    // Listen for any user interaction
    document.addEventListener('click', playOnInteraction, { once: true });
    document.addEventListener('touchstart', playOnInteraction, { once: true });
    document.addEventListener('keydown', playOnInteraction, { once: true });
  }


}