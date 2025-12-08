import {
  Component,
  EventEmitter,
  Input,
  Output,
  SimpleChanges,
} from "@angular/core";

@Component({
  selector: "video-tile",
  templateUrl: "./video-tile.component.html",
  styleUrls: ["./video-tile.component.css"],
})
export class VideoTileComponent {
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
    }
    if (audioTrack?.currentValue && this.audioStream) {
      this.updateAudioTrack(audioTrack.previousValue, audioTrack.currentValue);
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
    }
    if (screenAudioTrack?.currentValue && this.screenAudioStream) {
      this.updateScreenAudioTrack(screenAudioTrack.previousValue, screenAudioTrack.currentValue);
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
    }, 100);
  }

  onScreenAudioLoadStart(event: Event): void {
    // When screen audio element starts loading new content, request volume reapplication
    console.log('Screen audio loadstart event for', this.userName, '- requesting volume reapplication');
    setTimeout(() => {
      this.requestVolumeReapplication();
    }, 100);
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
}