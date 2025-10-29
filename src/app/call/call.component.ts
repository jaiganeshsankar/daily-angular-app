import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import DailyIframe, {
  DailyCall,
  DailyEventObjectParticipant,
  DailyParticipant,
  DailyEventObjectFatalError,
  DailyEventObjectParticipants,
  DailyEventObjectNoPayload,
  DailyEventObjectParticipantLeft,
  DailyEventObjectTrack,
} from "@daily-co/daily-js";
import { LiveStreamService } from "../services/live-stream.service";

export type Participant = {
  videoTrack?: MediaStreamTrack | undefined;
  audioTrack?: MediaStreamTrack | undefined;
  screenVideoTrack?: MediaStreamTrack | undefined;
  screenAudioTrack?: MediaStreamTrack | undefined;
  videoReady: boolean;
  audioReady: boolean;
  screenVideoReady: boolean;
  screenAudioReady: boolean;
  userName: string;
  local: boolean;
  id: string;
  role: 'backstage' | 'stage';
};

export type VirtualBackgroundType = 'none' | 'blur' | 'image';

export interface VirtualBackgroundOption {
  type: VirtualBackgroundType;
  label: string;
  value?: string;
  thumbnail?: string;
}

// NEW: Layout types
export type StageLayout = 'grid' | 'screenshare-horizontal' | 'screenshare-vertical' | 'screenshare-full';

const PLAYABLE_STATE = "playable";
const LOADING_STATE = "loading";

type Participants = {
  [key: string]: Participant;
};

@Component({
  selector: "app-call",
  templateUrl: "./call.component.html",
  styleUrls: ["./call.component.css"],
})
export class CallComponent implements OnInit, OnDestroy {
  Object = Object;
  @Input() dailyRoomUrl: string;
  @Input() userName: string;
  @Output() callEnded: EventEmitter<null> = new EventEmitter();
  callObject: DailyCall | undefined;
  error: string = "";
  participants: Participants = {};
  isPublic: boolean = true;
  joined: boolean = false;
  isScreenSharing: boolean = false;
  screenSharingParticipant: Participant | null = null;
  showVirtualBgMenu: boolean = false;
  currentVirtualBg: VirtualBackgroundType = 'none';
  currentVirtualBgValue: string | null = null;
  isLoadingVirtualBg: boolean = false;
  localParticipantRole: 'backstage' | 'stage' = 'backstage';
  participantRoles: { [sessionId: string]: 'backstage' | 'stage' } = {};

  // NEW: Layout state
  currentLayout: StageLayout = 'grid';
  showLayoutMenu: boolean = false;

  // NEW: Live streaming state
  isLive: boolean = false;
  private liveStreamSubscription: Subscription;

  constructor(private liveStreamService: LiveStreamService) {}

  virtualBackgroundOptions: VirtualBackgroundOption[] = [
    { type: 'none', label: 'None', thumbnail: '' },
    { type: 'blur', label: 'Blur', thumbnail: '' },
    {
      type: 'image',
      label: 'Office',
      value: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&fm=jpg&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=200&fm=jpg'
    },
    {
      type: 'image',
      label: 'Beach',
      value: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&fm=jpg&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&fm=jpg'
    },
    {
      type: 'image',
      label: 'Mountains',
      value: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&fm=jpg&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&fm=jpg'
    },
    {
      type: 'image',
      label: 'City',
      value: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1920&fm=jpg&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=200&fm=jpg'
    },
    {
      type: 'image',
      label: 'Abstract',
      value: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&fm=jpg&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=200&fm=jpg'
    },
  ];

  async ngOnInit(): Promise<void> {
    // Subscribe to live stream state
    this.liveStreamSubscription = this.liveStreamService.liveState$.subscribe(isLive => {
      this.isLive = isLive;
    });

    try {
      this.callObject = DailyIframe.getCallInstance();
      if (!this.callObject) {
        this.callObject = DailyIframe.createCallObject({
          strictMode: false,
          subscribeToTracksAutomatically: false,
        });
      }

      this.callObject
        .on("joined-meeting", this.handleJoinedMeeting)
        .on("participant-joined", this.participantJoined)
        .on("participant-updated", this.handleParticipantUpdated)
        .on("track-started", this.handleTrackStartedStopped)
        .on("track-stopped", this.handleTrackStartedStopped)
        .on("participant-left", this.handleParticipantLeft)
        .on("left-meeting", this.handleLeftMeeting)
        .on("error", this.handleError)
        .on("loading", this.handleLoading)
        .on("load-attempt-failed", this.handleLoadAttemptFailed)
        .on("loaded", this.handleLoaded)
        .on("app-message", this.handleAppMessage);

      await this.callObject.join({
        userName: this.userName,
        url: this.dailyRoomUrl,
      });
    } catch (error: any) {
      console.error("Failed to initialize Daily call:", error);
      this.error = `Failed to join call: ${error.message || 'Please check your internet connection and try again.'}`;

      setTimeout(() => {
        this.callEnded.emit();
      }, 3000);
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from live stream service
    if (this.liveStreamSubscription) {
      this.liveStreamSubscription.unsubscribe();
    }

    // Update joined state
    this.liveStreamService.setJoinedState(false);

    if (!this.callObject) return;
    this.callObject
      .off("joined-meeting", this.handleJoinedMeeting)
      .off("participant-joined", this.participantJoined)
      .off("participant-updated", this.handleParticipantUpdated)
      .off("track-started", this.handleTrackStartedStopped)
      .off("track-stopped", this.handleTrackStartedStopped)
      .off("participant-left", this.handleParticipantLeft)
      .off("left-meeting", this.handleLeftMeeting)
      .off("error", this.handleError)
      .off("loading", this.handleLoading)
      .off("load-attempt-failed", this.handleLoadAttemptFailed)
      .off("loaded", this.handleLoaded)
      .off("app-message", this.handleAppMessage);
  }

  handleAppMessage = (e: any): void => {
    if (!e || !e.data || !e.data.type) return;

    if (e.data.type === 'ROLE_REQUEST' && e.data.newRole) {
      console.log(`Received role change request from ${e.fromId}: ${e.data.newRole}`);
      this.callObject?.setUserData({ role: e.data.newRole });
    }

    // NEW: Handle layout change messages
    if (e.data.type === 'LAYOUT_CHANGE' && e.data.layout) {
      console.log(`Received layout change from ${e.fromId}: ${e.data.layout}`);
      this.currentLayout = e.data.layout;
    }
  };

  formatParticipantObj(p: DailyParticipant): Participant {
    const { video, audio, screenVideo, screenAudio } = p.tracks;
    const vt = video?.persistentTrack;
    const at = audio?.persistentTrack;
    const svt = screenVideo?.persistentTrack;
    const sat = screenAudio?.persistentTrack;

    let role: 'backstage' | 'stage' = 'backstage';
    if (p.userData && typeof p.userData === 'object' && 'role' in p.userData) {
      const userRole = (p.userData as any).role;
      if (userRole === 'stage' || userRole === 'backstage') {
        role = userRole;
      }
    }
    else {
      role = this.participantRoles[p.session_id] || 'backstage';
    }

    const participant: Participant = {
      videoTrack: vt,
      audioTrack: at,
      screenVideoTrack: svt,
      screenAudioTrack: sat,
      videoReady: !!(vt && (video.state === PLAYABLE_STATE || video.state === LOADING_STATE)),
      audioReady: !!(at && (audio.state === PLAYABLE_STATE || audio.state === LOADING_STATE)),
      screenVideoReady: !!(svt && (screenVideo.state === PLAYABLE_STATE || screenVideo.state === LOADING_STATE)),
      screenAudioReady: !!(sat && (screenAudio.state === PLAYABLE_STATE || screenAudio.state === LOADING_STATE)),
      userName: p.user_name,
      local: p.local,
      id: p.session_id,
      role: role,
    };

    return participant;
  }

  addParticipant(participant: DailyParticipant) {
    const p = this.formatParticipantObj(participant);
    this.participants[participant.session_id] = p;
    this.participantRoles[participant.session_id] = p.role;
    this.updateAudioSubscriptions();
  }

  updateTrack(participant: DailyParticipant, newTrackType: string): void {
    const existingParticipant = this.participants[participant.session_id];
    if (!existingParticipant) return;

    const currentParticipantCopy = this.formatParticipantObj(participant);

    if (newTrackType === "video") {
      if (existingParticipant.videoReady !== currentParticipantCopy.videoReady) {
        existingParticipant.videoReady = currentParticipantCopy.videoReady;
      }
      if (currentParticipantCopy.videoReady && existingParticipant.videoTrack?.id !== currentParticipantCopy.videoTrack?.id) {
        existingParticipant.videoTrack = currentParticipantCopy.videoTrack;
      }
      return;
    }

    if (newTrackType === "audio") {
      if (existingParticipant.audioReady !== currentParticipantCopy.audioReady) {
        existingParticipant.audioReady = currentParticipantCopy.audioReady;
      }
      if (currentParticipantCopy.audioReady && existingParticipant.audioTrack?.id !== currentParticipantCopy.audioTrack?.id) {
        existingParticipant.audioTrack = currentParticipantCopy.audioTrack;
      }
      return;
    }

    if (newTrackType === "screenVideo") {
      if (existingParticipant.screenVideoReady !== currentParticipantCopy.screenVideoReady) {
        existingParticipant.screenVideoReady = currentParticipantCopy.screenVideoReady;
      }
      if (currentParticipantCopy.screenVideoReady && existingParticipant.screenVideoTrack?.id !== currentParticipantCopy.videoTrack?.id) {
        existingParticipant.screenVideoTrack = currentParticipantCopy.screenVideoTrack;
      }
      return;
    }

    if (newTrackType === "screenAudio") {
      if (existingParticipant.screenAudioReady !== currentParticipantCopy.screenAudioReady) {
        existingParticipant.screenAudioReady = currentParticipantCopy.screenAudioReady;
      }
      if (currentParticipantCopy.screenAudioReady && existingParticipant.screenAudioTrack?.id !== currentParticipantCopy.screenAudioTrack?.id) {
        existingParticipant.screenAudioTrack = currentParticipantCopy.screenAudioTrack;
      }
    }
  }

  handleJoinedMeeting = (e: DailyEventObjectParticipants | undefined): void => {
    if (!e || !this.callObject) return;
    console.log(e);
    this.joined = true;
    
    // Update joined state in service
    this.liveStreamService.setJoinedState(true);

    const { access } = this.callObject.accessState();
    this.isPublic = access !== "unknown" && access.level === "full";

    this.localParticipantRole = 'backstage';
    this.callObject.setUserData({ role: 'backstage' });

    Object.values(e.participants).forEach(p => {
      this.addParticipant(p);
    });

    const localId = e.participants.local.session_id;
    if (this.participants[localId]) {
      this.participants[localId].role = 'backstage';
      this.participantRoles[localId] = 'backstage';
    }

    this.updateAudioSubscriptions();
  };

  participantJoined = (e: DailyEventObjectParticipant | undefined) => {
    if (!e) return;
    console.log(e.action);
    this.addParticipant(e.participant);
  };

  handleParticipantUpdated = (e: DailyEventObjectParticipant | undefined) => {
    if (!e) return;
    console.log('Participant updated:', e.participant.user_name, e.participant.userData);
    const participant = e.participant;
    const existingP = this.participants[participant.session_id];
    if (!existingP) {
      this.addParticipant(participant);
      return;
    }

    const updatedP = this.formatParticipantObj(participant);

    existingP.role = updatedP.role;
    this.participantRoles[participant.session_id] = updatedP.role;

    if (existingP.local) {
      this.localParticipantRole = updatedP.role;
    }

    this.updateAudioSubscriptions();
  };

  handleTrackStartedStopped = (e: DailyEventObjectTrack | undefined): void => {
    console.log("track started or stopped");
    if (!e || !e.participant || !this.joined) return;
    this.updateTrack(e.participant, e.type);

    if (e.participant.local && e.type === "screenVideo") {
      this.isScreenSharing = e.participant.tracks.screenVideo?.state === PLAYABLE_STATE ||
        e.participant.tracks.screenVideo?.state === LOADING_STATE;
    }

    this.updateScreenSharingParticipant();
  };

  handleParticipantLeft = (e: DailyEventObjectParticipantLeft | undefined): void => {
    if (!e) return;
    console.log(e.action);

    delete this.participants[e.participant.session_id];
    delete this.participantRoles[e.participant.session_id];

    this.updateScreenSharingParticipant();
  };

  handleError = (e: DailyEventObjectFatalError | undefined): void => {
    if (!e) return;
    console.log(e);
    this.error = e.errorMsg;

    if (e.errorMsg.includes('Failed to load') || e.errorMsg.includes('Failed to fetch')) {
      setTimeout(() => {
        if (this.callObject) {
          this.callObject.destroy();
        }
        this.callEnded.emit();
      }, 3000);
    }
  };

  handleLoading = (): void => {
    console.log('Daily call object is loading...');
  };

  handleLoadAttemptFailed = (e: any): void => {
    console.error('Daily load attempt failed:', e);
    this.error = 'Failed to load call resources. Please check your internet connection and try again.';
  };

  handleLoaded = (): void => {
    console.log('Daily call object loaded successfully');
  };

  handleLeftMeeting = (e: DailyEventObjectNoPayload | undefined): void => {
    if (!e || !this.callObject) return;
    console.log(e);
    this.joined = false;
    
    // Update joined state in service
    this.liveStreamService.setJoinedState(false);
    
    this.callObject.destroy();
    this.callEnded.emit();
  };

  leaveCall(): void {
    this.error = "";
    if (!this.callObject) return;
    this.callObject.leave();
  }

  toggleLocalVideo() {
    if (!this.joined || !this.callObject) return;
    const videoReady = this.callObject.localVideo();
    this.callObject.setLocalVideo(!videoReady);
  }

  toggleLocalAudio() {
    if (!this.joined || !this.callObject) return;
    const audioReady = this.callObject.localAudio();
    this.callObject.setLocalAudio(!audioReady);
  }

  async toggleScreenShare() {
    if (!this.joined || !this.callObject) return;

    try {
      if (this.isScreenSharing) {
        await this.callObject.stopScreenShare();
        this.isScreenSharing = false;
      } else {
        await this.callObject.startScreenShare();
        this.isScreenSharing = true;
      }

      this.updateScreenSharingParticipant();
    } catch (error) {
      console.error("Error toggling screen share:", error);
      this.error = "Failed to toggle screen share. Please try again.";
    }
  }

  toggleLiveStream(): void {
    if (!this.joined || !this.callObject) return;

    try {
      if (this.isLive) {
        // End live stream
        this.endLiveStream();
        this.liveStreamService.setLiveState(false);
        console.log('Live stream ended');
      } else {
        // Start live stream
        this.startLiveStream();
        this.liveStreamService.setLiveState(true);
        console.log('Live stream started');
      }
    } catch (error) {
      console.error("Error toggling live stream:", error);
      this.error = "Failed to toggle live stream. Please try again.";
      setTimeout(() => { this.error = ''; }, 3000);
    }
  }

  private startLiveStream(): void {
    // TODO: Implement live streaming functionality
    // This could integrate with services like:
    // - Daily.co's live streaming API
    // - RTMP endpoints
    // - YouTube Live, Twitch, etc.
    console.log('Starting live stream...');
  }

  private endLiveStream(): void {
    // TODO: Implement end live streaming functionality
    console.log('Ending live stream...');
  }

  updateScreenSharingParticipant(): void {
    const sharingParticipant = Object.values(this.participants).find(p => p.screenVideoReady);
    this.screenSharingParticipant = sharingParticipant || null;
  }

  getSidebarParticipants(): Participant[] {
    return Object.values(this.participants).filter(
      p => p.role === 'stage'
    );
  }

  getStageParticipants(): Participant[] {
    return Object.values(this.participants).filter(p => p.role === 'stage');
  }

  getBackstageParticipants(): Participant[] {
    return Object.values(this.participants).filter(p => p.role === 'backstage');
  }

  toggleParticipantRole(participant: Participant): void {
    if (!participant) return;
    if (participant.role === 'stage') {
      this.moveParticipantToBackstage(participant.id);
    } else {
      this.moveParticipantToStage(participant.id);
    }
  }

  async moveParticipantToStage(participantId: string): Promise<void> {
    const participant = this.participants[participantId];
    if (!participant || participant.role === 'stage') return;

    try {
      if (participant.local) {
        await this.callObject!.setUserData({ role: 'stage' });
      } else {
        this.callObject!.sendAppMessage({
          type: 'ROLE_REQUEST',
          newRole: 'stage'
        }, participantId);
      }
    } catch (error) {
      console.error('Error setting local user data:', error);
      this.error = 'Failed to set local role.';
      setTimeout(() => { this.error = ''; }, 3000);
    }
  }

  async moveParticipantToBackstage(participantId: string): Promise<void> {
    const participant = this.participants[participantId];
    if (!participant || participant.role === 'backstage') return;

    try {
      if (participant.local) {
        await this.callObject!.setUserData({ role: 'backstage' });
      } else {
        this.callObject!.sendAppMessage({
          type: 'ROLE_REQUEST',
          newRole: 'backstage'
        }, participantId);
      }
    } catch (error) {
      console.error('Error setting local user data:', error);
      this.error = 'Failed to set local role.';
      setTimeout(() => { this.error = ''; }, 3000);
    }
  }

  updateAudioSubscriptions(): void {
    if (!this.callObject || !this.joined) return;

    try {
      const updateObject: any = {};

      Object.values(this.participants).forEach(participant => {
        if (participant.local) return;

        let shouldSubscribeAudio = false;

        if (this.localParticipantRole === 'backstage') {
          shouldSubscribeAudio = true;
        }
        else if (this.localParticipantRole === 'stage') {
          shouldSubscribeAudio = participant.role === 'stage';
        }

        updateObject[participant.id] = {
          setSubscribedTracks: {
            audio: shouldSubscribeAudio,
            video: true,
            screenVideo: true,
            screenAudio: true
          }
        };
      });

      if (Object.keys(updateObject).length > 0) {
        this.callObject.updateParticipants(updateObject);
        console.log('Audio subscriptions updated (what we hear):', updateObject);
      }

    } catch (error: any) {
      console.error('Error updating audio subscriptions:', error);
      this.error = `Error updating audio subscriptions: ${error.message}`;
    }
  }

  toggleVirtualBgMenu(): void {
    this.showVirtualBgMenu = !this.showVirtualBgMenu;
  }

  async applyVirtualBackground(option: VirtualBackgroundOption): Promise<void> {
    if (!this.callObject || !this.joined || this.isLoadingVirtualBg) return;

    this.isLoadingVirtualBg = true;
    let success = false;

    try {
      if (option.type === 'none') {
        await this.callObject.updateInputSettings({
          video: { processor: { type: 'none' } }
        });
        this.currentVirtualBg = 'none';
        this.currentVirtualBgValue = null;
        success = true;
      } else if (option.type === 'blur') {
        await this.callObject.updateInputSettings({
          video: { processor: { type: 'background-blur', config: { strength: 0.5 } } }
        });
        this.currentVirtualBg = 'blur';
        this.currentVirtualBgValue = null;
        success = true;
      } else if (option.type === 'image' && option.value) {
        const imageArrayBuffer = await this.loadImageAsArrayBuffer(option.value);
        await this.callObject.updateInputSettings({
          video: { processor: { type: 'background-image', config: { source: imageArrayBuffer } } }
        });
        this.currentVirtualBg = 'image';
        this.currentVirtualBgValue = option.value;
        success = true;
      }

      if (success) {
        this.showVirtualBgMenu = false;
      }

    } catch (error: any) {
      console.error('Error applying virtual background:', error);
      this.error = `Failed to apply virtual background: ${error.message || 'Please try again.'}`;
      setTimeout(() => { this.error = ''; }, 3000);
    } finally {
      this.isLoadingVirtualBg = false;
    }
  }

  private async loadImageAsArrayBuffer(imageUrl: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`Failed to load image: ${response.statusText}`);

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      if (!blob.type.match(/image\/(jpeg|jpg|png)/i)) {
        console.warn(`Image type is ${blob.type}, attempting to convert...`);
        return await this.convertImageToArrayBuffer(imageUrl);
      }

      return arrayBuffer;
    } catch (error) {
      console.error('Error loading image, trying canvas conversion:', error);
      try {
        return await this.convertImageToArrayBuffer(imageUrl);
      } catch (conversionError) {
        console.error('Canvas conversion also failed:', conversionError);
        throw new Error('Failed to load background image. Please try another option.');
      }
    }
  }

  private async convertImageToArrayBuffer(imageUrl: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            resolve(arrayBuffer);
          } else {
            reject(new Error('Failed to convert image to blob'));
          }
        }, 'image/jpeg', 0.95);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image. The image may not be accessible.'));
      };

      img.src = imageUrl;
    });
  }

  // NEW: Layout methods
  toggleLayoutMenu(): void {
    this.showLayoutMenu = !this.showLayoutMenu;
  }

  changeLayout(layout: StageLayout): void {
    if (!this.callObject || !this.joined) return;

    this.currentLayout = layout;
    this.showLayoutMenu = false;

    // Broadcast layout change to all participants
    this.callObject.sendAppMessage({
      type: 'LAYOUT_CHANGE',
      layout: layout
    }, '*');

    console.log('Layout changed to:', layout);
  }

  getLayoutIcon(layout: StageLayout): string {
    const icons = {
      'grid': 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
      'screenshare-horizontal': 'M3 3h18v11H3zm0 14h5v4H3zm7 0h5v4h-5zm7 0h5v4h-5z',
      'screenshare-vertical': 'M3 3h14v18H3zm17 0h4v4h-4zm0 6h4v4h-4zm0 6h4v4h-4z',
      'screenshare-full': 'M3 3h18v18H3z'
    };
    return icons[layout];
  }
}