import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from "@angular/core";
import { timer, Subscription } from 'rxjs';
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
import { VideoLayout } from "../models/video-layout.enum";
import { LiveStreamService } from "../services/live-stream.service";
import { SafariAudioService } from "../services/safari-audio.service";

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
// export type StageLayout = 'grid' | 'screenshare-horizontal' | 'screenshare-vertical' | 'screenshare-full';

const PLAYABLE_STATE = "playable";
const LOADING_STATE = "loading";

type Participants = {
    [key: string]: Participant;
};

@Component({
    selector: "app-video-call",
    templateUrl: "./video-group.component.html",
    styleUrls: ["./video-group.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoGroupComponent implements OnInit, OnDestroy {
    Object = Object;
    readonly VideoLayout = VideoLayout;
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
    layouts: any = [];

    // NEW: Layout state
    selectedLayout: VideoLayout = VideoLayout.TILED;
    showLayoutMenu: boolean = false;

    // NEW: Live streaming state
    isLive: boolean = false;
    private liveStreamSubscription: Subscription;
    private toggleStreamSubscription: Subscription;
    private toggleOverlaySubscription: Subscription;
    private textOverlaySubscription: Subscription;
    private imageOverlaySubscription: Subscription;
    private recordingEnabledSubscription: Subscription;

    // NEW: Unified audio control properties for backstage users
    mainAudioVolume: number = 1; // Controls both stage voices and screenshare audio
    isBackstageMuted: boolean = false;
    
    // NEW: Overlay state variables
    showTextOverlay: boolean = true;
    showImageOverlay: boolean = true;
    recordingEnabled: boolean = false; // Changed to false for safety first
    private isUpdatingFromMessage: boolean = false; // Prevent infinite loops
    showGoLiveMenu: boolean = false;
    readonly OVERLAY_IMAGE_URL = 'https://assets.daily.co/assets/daily-logo-light.png';
    
    // SAFARI AUDIO FIX: Health monitoring
    private audioHealthCheckInterval: any;
    private readonly AUDIO_HEALTH_CHECK_INTERVAL = 5000; // Check every 5 seconds
    readonly OVERLAY_TEXT = 'Live from Daily Angular';
    
    // SCREENSHARE MONITORING: Track screenshare health with large participant counts
    private screenshareHealthCheckInterval: any;
    private readonly SCREENSHARE_HEALTH_CHECK_INTERVAL = 3000; // Check every 3 seconds
    private screenshareFailureCount: number = 0;
    
    // Active speaker tracking for presentation layout
    activeSpeakerId: string | null = null;
    
    // Volume reapplication event listener
    private volumeReapplicationListener: (event: any) => void;

    constructor(
        private liveStreamService: LiveStreamService,
        private cdr: ChangeDetectorRef,
        private safariAudioService: SafariAudioService
    ) {}

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

        // Subscribe to toggle stream events
        this.toggleStreamSubscription = this.liveStreamService.toggleStream$.subscribe(() => {
            console.log('🎬 VideoGroupComponent: Received toggle stream event');
            this.toggleLiveStream();
        });

        // Subscribe to overlay toggle events
        this.toggleOverlaySubscription = this.liveStreamService.toggleOverlay$.subscribe(({ type }) => {
            console.log(`🎨 VideoGroupComponent: Received toggle overlay event for ${type}`);
            this.handleOverlayToggle(type);
        });
        
        // Recording toggle functionality is now handled through the Go Live dropdown
        // No need for separate recording toggle subscription

        // Subscribe to overlay state changes
        this.textOverlaySubscription = this.liveStreamService.textOverlayState$.subscribe(visible => {
            console.log('📝 Text overlay state changed to:', visible);
            this.showTextOverlay = visible;
            this.cdr.detectChanges();
        });
        
        this.imageOverlaySubscription = this.liveStreamService.imageOverlayState$.subscribe(visible => {
            console.log('🖼️ Image overlay state changed to:', visible);
            this.showImageOverlay = visible;
            this.cdr.detectChanges();
        });
        
        this.recordingEnabledSubscription = this.liveStreamService.recordingEnabledState$.subscribe(enabled => {
            if (this.recordingEnabled !== enabled) {
                console.log('🎥 VideoGroupComponent: Recording state changed to:', enabled);
            }
            this.recordingEnabled = enabled;
            
            // Only broadcast if this is not from a received message (prevent infinite loop)
            if (this.callObject && this.joined && !this.isUpdatingFromMessage) {
                this.callObject.sendAppMessage({
                    type: 'RECORDING_SETTING',
                    enabled: enabled
                }, '*');
            }
            
            this.cdr.markForCheck();
            this.cdr.detectChanges();
        });

        // Listen for volume reapplication requests from audio elements
        this.volumeReapplicationListener = (event: any) => {
            // Volume reapplication requested - removed log to prevent spam
            this.debouncedVolumeReapply();
        };
        document.addEventListener('requestVolumeReapplication', this.volumeReapplicationListener);

        try {
            this.layouts = [VideoLayout.TILED,
            VideoLayout.PINNED_VERTICAL, VideoLayout.PINNED_HORIZONTAL, VideoLayout.FULL_SCREEN, VideoLayout.PRESENTATION];
            this.callObject = DailyIframe.getCallInstance();
            if (!this.callObject) {
                this.callObject = DailyIframe.createCallObject({
                    strictMode: false,
                    subscribeToTracksAutomatically: false,
                });
            } else {
                // Ensure subscribeToTracksAutomatically is disabled even for existing call objects
                try {
                    await this.callObject.setSubscribeToTracksAutomatically(false);
                } catch (error) {
                    console.warn('Could not disable subscribeToTracksAutomatically on existing call object:', error);
                }
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
                .on("app-message", this.handleAppMessage)
                .on("live-streaming-started", this.handleLiveStreamingStarted)
                .on("live-streaming-stopped", this.handleLiveStreamingStopped)
                .on("live-streaming-error", this.handleLiveStreamingError)
                .on("active-speaker-change", this.handleActiveSpeakerChange);

            await this.callObject.join({
                userName: this.userName,
                url: this.dailyRoomUrl,
                token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyIjoiQmk0dEFPWTJGRUs1Z2k1bllLbWUiLCJvIjp0cnVlLCJzcyI6dHJ1ZSwiZCI6Ijg3YmEzM2JiLWQ3YjAtNDA5OC1iMGVmLWNkYWFjMDg1MTc2MCIsImlhdCI6MTc2MTY2ODI3MX0.caecSEIZwos2YZV0NbHI2NoeN-IVCgdbAuju2bWTmKg',
                startAudioOff: true,   // Start with audio muted by default
                startVideoOff: false
            });
            
            // Set high-quality audio input after joining
            try {
                await this.callObject.updateInputSettings({
                    audio: {
                        // Disable audio processing for higher fidelity
                        processor: { type: 'none' }
                    }
                });
                console.log('High-quality audio settings applied');
            } catch (error) {
                console.warn('Could not apply high-quality audio settings:', error);
            }
            
            // Disable local audio monitoring to prevent hearing yourself
            if (this.callObject.localAudio()) {
                console.log('🔇 Disabling local audio monitoring to prevent self-hearing');
                // Daily.js doesn't route local audio to outputs by default, but let's ensure it
            }
        } catch (error: any) {
            console.error("Failed to initialize Daily call:", error);
            this.error = `Failed to join call: ${error.message || 'Please check your internet connection and try again.'}`;

            setTimeout(() => {
                this.callEnded.emit();
            }, 3000);
        }
    }

    ngOnDestroy(): void {
        // Clean up timeouts to prevent memory leaks and reduce CPU usage
        if (this.layoutRecalcTimeout) {
            clearTimeout(this.layoutRecalcTimeout);
        }
        if (this.volumeReapplyTimeout) {
            clearTimeout(this.volumeReapplyTimeout);
        }
        
        if (this.audioHealthCheckInterval) {
            clearInterval(this.audioHealthCheckInterval);
        }
        if (this.screenshareHealthCheckInterval) {
            clearInterval(this.screenshareHealthCheckInterval);
        }
        
        // Unsubscribe from live stream service
        if (this.liveStreamSubscription) {
            this.liveStreamSubscription.unsubscribe();
        }
        if (this.toggleStreamSubscription) {
            this.toggleStreamSubscription.unsubscribe();
        }
        if (this.toggleOverlaySubscription) {
            this.toggleOverlaySubscription.unsubscribe();
        }
        // toggleRecordingSubscription removed - handled through Go Live dropdown
        if (this.textOverlaySubscription) {
            this.textOverlaySubscription.unsubscribe();
        }
        if (this.imageOverlaySubscription) {
            this.imageOverlaySubscription.unsubscribe();
        }
        if (this.recordingEnabledSubscription) {
            this.recordingEnabledSubscription.unsubscribe();
        }

        // Update joined state
        this.liveStreamService.setJoinedState(false);

        // Remove volume reapplication event listener
        if (this.volumeReapplicationListener) {
            document.removeEventListener('requestVolumeReapplication', this.volumeReapplicationListener);
        }

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
            .off("app-message", this.handleAppMessage)
            .off("live-streaming-started", this.handleLiveStreamingStarted)
            .off("live-streaming-stopped", this.handleLiveStreamingStopped)
            .off("live-streaming-error", this.handleLiveStreamingError)
            .off("active-speaker-change", this.handleActiveSpeakerChange);
    }

    handleAppMessage = (e: any): void => {
        if (!e || !e.data || !e.data.type) return;

        if (e.data.type === 'ROLE_REQUEST' && e.data.newRole) {
            console.log(`Received role change request from ${e.fromId}: ${e.data.newRole}`);
            this.callObject?.setUserData({ role: e.data.newRole });
            this.reCalculateLayoutData();
        }

        // Handle layout sync from existing participants to new participants
        if (e.data.type === 'LAYOUT_SYNC' && e.data.layout) {
            console.log(`📨 Received layout sync from ${e.fromId}: ${e.data.layout}`);
            this.selectedLayout = e.data.layout;
            this.reCalculateLayoutData();
            this.cdr.detectChanges();
        }
        
        // Handle regular layout changes from UI
        if (e.data.type === 'LAYOUT_CHANGE' && e.data.layout) {
            console.log(`📨 Received layout change from ${e.fromId}: ${e.data.layout}`);
            this.selectedLayout = e.data.layout;
            this.reCalculateLayoutData();
            this.cdr.detectChanges();
        }
        
        // NEW: Handle overlay update messages
        if (e.data.type === 'OVERLAY_UPDATE' && e.data.overlay && typeof e.data.visible === 'boolean') {
            console.log(`Received overlay update from ${e.fromId}: ${e.data.overlay} = ${e.data.visible}`);
            if (e.data.overlay === 'text') {
                this.showTextOverlay = e.data.visible;
                this.liveStreamService.setTextOverlayState(e.data.visible);
            } else if (e.data.overlay === 'image') {
                this.showImageOverlay = e.data.visible;
                this.liveStreamService.setImageOverlayState(e.data.visible);
            }
            this.updateLiveStreamLayout();
            // Force change detection to update UI
            this.cdr.detectChanges();
        }
        
        // Get local participant ID to ignore self-messages and prevent infinite loops
        const localParticipant = this.callObject?.participants()?.local;
        const isFromSelf = localParticipant && e.fromId === localParticipant.session_id;
        
        // Handle RECORDING_SETTING messages for Go Live dropdown selection (ignore messages from self)
        if (e.data.type === 'RECORDING_SETTING' && typeof e.data.enabled === 'boolean' && !isFromSelf) {
            console.log(`📡 Received recording setting from ${e.fromId}: ${e.data.enabled}`);
            
            // Set flag to prevent broadcasting when updating from message
            this.isUpdatingFromMessage = true;
            this.recordingEnabled = e.data.enabled;
            this.liveStreamService.setRecordingEnabled(e.data.enabled);
            this.isUpdatingFromMessage = false;
            
            this.cdr.detectChanges();
        }
        
        // Handle recording state change messages (ignore messages from self)
        if (e.data.type === 'RECORDING_STATE_CHANGE' && typeof e.data.recordingEnabled === 'boolean' && !isFromSelf) {
            console.log(`📡 Received recording state change from ${e.fromId}: ${e.data.recordingEnabled}`);
            
            // Set flag to prevent broadcasting when updating from message  
            this.isUpdatingFromMessage = true;
            this.liveStreamService.setRecordingEnabled(e.data.recordingEnabled);
            this.isUpdatingFromMessage = false;
            
            this.cdr.markForCheck();
            this.cdr.detectChanges();
        }
        

    };


    trackByPeerId(index: number, peer: any) {
        return peer.id;
    }

    getRowIndex(i: number): number {
        return Math.floor(i / this.getCols()) + 1;
    }

    getCols(): number {
        const grid = document.querySelector('.tiled-grid') as HTMLElement;
        if (grid) {
            const cols = grid.style.getPropertyValue('--grid-cols');
            return parseInt(cols) || 1;
        }
        return 1;
    }

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
        // Reduced logging for performance
        
        this.participants[participant.session_id] = p;
        this.participantRoles[participant.session_id] = p.role;
        this.updateTrackSubscriptions();

        // Prevent local audio feedback - ensure local participant audio is never played
        if (p.local) {
            console.log('🔇 Local participant - audio should NOT play through HTML elements');
            
            // Double-check that audio won't play for local participant
            if (p.audioTrack) {
                console.warn('⚠️ Local participant has audio track - this should not cause playback');
            }
        } else {
            console.log('🔊 Remote participant joined - audio will play through HTML elements');
            
            // New participants join muted - their audio track may not be immediately available
            if (!p.audioTrack) {
                console.log('🔇 Remote participant joined muted (no audio track yet)');
            }
        }

        // NEW: Apply volume controls to new remote participants
        if (!p.local) {
            // Delay volume application to allow audio elements to be created
            setTimeout(() => {
                if (p.role === 'stage') {
                    this.setParticipantAudioVolume(p.id, this.mainAudioVolume);
                } else if (p.role === 'backstage') {
                    this.setParticipantAudioVolume(p.id, this.isBackstageMuted ? 0 : 1);
                }
                
                // Apply screenshare audio volume if participant has screen audio
                if (p.screenAudioTrack) {
                    this.setScreenshareAudioVolume(this.mainAudioVolume);
                }
            }, 100);
        }
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

    handleJoinedMeeting = async (e: DailyEventObjectParticipants | undefined): Promise<void> => {
        if (!e || !this.callObject) return;
        console.log(e);
        this.joined = true;

        // Update joined state in service
        this.liveStreamService.setJoinedState(true);

        // CPU OPTIMIZATION: Pre-warm the virtual background processor to prevent CPU spike on first use
        try {
            console.log('🎭 Pre-warming virtual background processor for optimal performance...');
            // This call initializes the ML model and processing pipeline
            // without applying any visual effect - prevents CPU spike later
            await this.callObject.updateInputSettings({
                video: { processor: { type: 'none' } }
            });
            console.log('✅ Virtual background processor pre-warmed and ready for CPU-optimized use');
            
            // CPU OPTIMIZATION: Log initial performance tips
            console.log('💡 Virtual Background Performance Tips:');
            console.log('   • Blur backgrounds use less CPU than custom images');
            console.log('   • Ensure good lighting for better background detection');  
            console.log('   • Close other applications when using virtual backgrounds');
            
        } catch (e) {
            console.warn('⚠️ Failed to pre-warm VB processor - virtual backgrounds may cause CPU spikes on first use:', e);
        }

        // Configure high-quality audio settings
        try {
            console.log('Configuring high-quality audio...');
            
            // Set audio constraints for higher quality
            const audioConstraints = {
                echoCancellation: true,      // Keep for feedback prevention
                noiseSuppression: false,     // Disable - can reduce quality
                autoGainControl: false,      // Disable - can cause compression artifacts
                sampleRate: { ideal: 48000 }, // High sample rate (48kHz)
                channelCount: { ideal: 2 }    // Stereo if supported
            };

            // Try to get a high-quality audio stream and set it
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints 
            });
            
            await this.callObject.setInputDevicesAsync({
                audioDeviceId: stream.getAudioTracks()[0].getSettings().deviceId
            });

            console.log('High-quality audio configured successfully');
        } catch (error) {
            console.warn('Could not configure high-quality audio:', error);
        }

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
        
        // Ensure local participant starts muted (audio should already be off from join settings)
        console.log('🔇 Participant joined with audio muted by default');

        this.updateTrackSubscriptions();
        
        // Start Safari audio health monitoring
        this.startAudioHealthMonitoring();
        
        // Start screenshare health monitoring for large calls
        this.startScreenshareHealthMonitoring();
        
        // Apply initial screenshare audio volume after a brief delay
        setTimeout(() => {
            this.setScreenshareAudioVolume(this.mainAudioVolume);
        }, 500);
    };

    participantJoined = (e: DailyEventObjectParticipant | undefined) => {
        if (!e) return;
        console.log(e.action);

        const participant = this.formatParticipantObj(e.participant);
        console.log(`👤 ${participant.userName} joined the call - Audio: ${participant.audioReady ? 'unmuted' : 'muted (default)'}`);

        this.addParticipant(e.participant);
        
        // Simple layout sync: Send current layout to new participant if it's not default
        if (this.callObject && this.selectedLayout !== VideoLayout.TILED) {
            setTimeout(() => {
                this.callObject?.sendAppMessage({
                    type: 'LAYOUT_SYNC',
                    layout: this.selectedLayout
                }, e.participant.session_id);
                console.log('🔄 Synced layout to new participant:', this.selectedLayout);
            }, 100);
        }
    };

    handleParticipantUpdated = async (e: DailyEventObjectParticipant | undefined) => {
        if (!e) return;
        // Removed excessive logging that fires constantly per participant
        const participant = e.participant;
        const existingP = this.participants[participant.session_id];
        if (!existingP) {
            this.addParticipant(participant);
            return;
        }
        const previousRole = existingP.role; // Store previous role
        const updatedP = this.formatParticipantObj(participant);
        existingP.role = updatedP.role;
        this.participantRoles[participant.session_id] = updatedP.role;

        if (existingP.local) {
            this.localParticipantRole = updatedP.role;
        }

        if (participant.local) {
            this.localParticipantRole = updatedP.role; // Update main role tracker

            // If the role changed FROM backstage TO stage, reset audio volume to default
            if (updatedP.role === 'stage' && previousRole === 'backstage') {
                console.log('Local participant joined stage, resetting audio volume to default.');
                this.mainAudioVolume = 1.0; // Reset to full volume
                this.updateAllAudioVolumes(); // Apply to all audio elements
            }

            // AND if the role changed TO backstage FROM stage
            if (updatedP.role === 'backstage' && previousRole === 'stage') {
                // AND if we are currently sharing screen
                if (this.isScreenSharing) {
                    try {
                        console.log('Stopping local screen share because local role changed to backstage.');
                        await this.callObject?.stopScreenShare();
                        this.updateScreenSharingParticipant();
                        
                        // Skip the live stream update below - it will be handled in updateScreenSharingParticipant()
                        // with proper timing after screen sharing state is cleared
                        return;
                    } catch (stopError) {
                        console.error('Error stopping local screen share on role change:', stopError);
                    }
                }
            }
        } else {
            // Handle remote participant role changes
            // If a remote participant who was screen sharing gets moved to backstage
            if (updatedP.role === 'backstage' && previousRole === 'stage') {
                // Check if this participant was the current screen sharer
                if (this.screenSharingParticipant && this.screenSharingParticipant.id === participant.session_id) {
                    console.log(`Remote participant ${participant.session_id} who was screen sharing moved to backstage. Updating live stream.`);
                    // We can't stop their screen share remotely, but we can immediately update our live stream layout
                    this.updateScreenSharingParticipant();
                    
                    // Skip the live stream update below - it will be handled in updateScreenSharingParticipant()
                    return;
                }
            }
        }

        // Update live stream if currently streaming
        if (this.isLive) {
            console.log('🔄 Live stream is active - updating participants due to role change...');
            try {
                const newLayoutOptions = this.getStreamingLayoutOptionsForUpdate();
                console.log('🔄 Updating live stream with new layout:', newLayoutOptions);
                
                if (this.callObject) {
                    await this.callObject.updateLiveStreaming({ 
                        layout: newLayoutOptions 
                    });
                    console.log('✅ Live stream updated successfully');
                    
                    // Sync recording layout update (if recording is enabled)
                    if (this.recordingEnabled) {
                        try {
                            await this.callObject.updateRecording({ layout: newLayoutOptions });
                            console.log('✅ Cloud recording layout updated successfully');
                        } catch (recordingUpdateError) {
                            console.warn('⚠️ Failed to update recording layout (may be initializing):', recordingUpdateError);
                        }
                    }
                }
            } catch (updateError) {
                console.error('❌ Failed to update live stream:', updateError);
                this.error = 'Failed to update live stream participants. Stream may need to be restarted.';
                setTimeout(() => { this.error = ''; }, 5000);
            }
        }

        // NEW: Apply volume controls to updated remote participants
        if (!participant.local) {
            setTimeout(() => {
                if (updatedP.role === 'stage') {
                    this.setParticipantAudioVolume(participant.session_id, this.mainAudioVolume);
                } else if (updatedP.role === 'backstage') {
                    this.setParticipantAudioVolume(participant.session_id, this.isBackstageMuted ? 0 : 1);
                }
            }, 100);
        }
        
        // Log participant audio state changes for debugging mute status
        if (!participant.local) {
            const previousAudioState = existingP.audioReady;
            const currentAudioState = updatedP.audioReady;
            if (previousAudioState !== currentAudioState) {
                console.log(`🎤 Participant ${updatedP.userName} audio:`, currentAudioState ? 'unmuted' : 'muted');
            }
        }

        this.updateTrackSubscriptions();
        
        // Note: Active speaker tracking should be handled by Daily.js active-speaker-change events
        // Don't manually set activeSpeakerId here as it can interfere with proper event handling
        
        // Removed excessive logging
        if (this.getStageParticipants().length > 0) {
            this.reCalculateLayoutData();
        }

        // CRITICAL FIX: Reapply all volume settings after participant/track changes
        // This fixes the bug where volumes reset when srcObject changes
        this.debouncedVolumeReapply();
    };

    handleTrackStartedStopped = (e: DailyEventObjectTrack | undefined): void => {
        // Removed excessive logging
        if (!e || !e.participant || !this.joined) return;
        this.updateTrack(e.participant, e.type);

        if (e.type === "screenVideo") {
            this.isScreenSharing = e.participant.tracks.screenVideo?.state === PLAYABLE_STATE ||
                e.participant.tracks.screenVideo?.state === LOADING_STATE;
        }

        this.updateScreenSharingParticipant();
        
        // CRITICAL FIX: Reapply volumes when tracks start/stop
        // This is especially important for screen audio tracks
        this.debouncedVolumeReapply();
        
        // SAFARI AUDIO FIX: Reconnect audio streams when audio tracks change
        if (e.type === "audio" && this.safariAudioService.isSafariBrowser()) {
            setTimeout(() => {
                this.safariAudioService.forceReconnectAllAudio();
            }, 200);
        }
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
        
        // Log audio state change for debugging
        console.log('🎤 Local audio toggled:', !audioReady ? 'unmuted' : 'muted');
        
        // DEBUG: Check if this should trigger active speaker change
        if (!audioReady) {
            console.log('🔍 Local participant unmuted - should become active speaker');
        } else {
            console.log('🔍 Local participant muted - active speaker may change');
        }
    }
    
    // Helper method to get local participant's audio state
    isLocalAudioMuted(): boolean {
        if (!this.callObject) return true;
        return !this.callObject.localAudio();
    }
    
    // VIRTUAL BACKGROUND OPTIMIZATION: Monitor performance and log CPU-saving tips
    private logVirtualBackgroundPerformanceTips(): void {
        console.log('🎭 Virtual Background Performance Tips:');
        console.log('   • Close other applications to free CPU resources');
        console.log('   • Use blur instead of image backgrounds (less CPU intensive)');
        console.log('   • Ensure good lighting for better background detection');
        console.log('   • Consider using a physical background for best performance');
        
        // Check system memory if available
        if ('memory' in performance) {
            const memInfo = (performance as any).memory;
            const usagePercent = (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize * 100).toFixed(1);
            console.log(`   • Current memory usage: ${usagePercent}%`);
            
            if (memInfo.usedJSHeapSize > memInfo.totalJSHeapSize * 0.8) {
                console.warn('⚠️ High memory usage detected - virtual background may cause performance issues');
            }
        }
    }

    async toggleScreenShare() {
        if (!this.joined || !this.callObject) return;

        try {
            if (this.isScreenSharing) {
                console.log('🛑 Stopping screen share...');
                await this.callObject.stopScreenShare();
                this.isScreenSharing = false;
                console.log('✅ Screen share stopped successfully');
            } else {
                console.log('▶️ Starting screen share...');
                
                // Check if we have permission and bandwidth for screenshare with many participants
                const participantCount = Object.keys(this.participants).length;
                if (participantCount > 8) {
                    console.warn(`⚠️ Large call detected (${participantCount} participants) - using optimized screenshare settings`);
                }
                
                // Start screenshare with optimized settings for large calls
                const screenshareOptions = {
                    video: {
                        frameRate: { ideal: 15, max: 30 }, // Limit framerate for better performance
                        width: { ideal: 1920, max: 1920 },
                        height: { ideal: 1080, max: 1080 }
                    },
                    audio: true // Include system audio if available
                };
                
                await this.callObject.startScreenShare(screenshareOptions);
                this.isScreenSharing = true;
                console.log('✅ Screen share started successfully with', participantCount, 'participants');
            }

            this.updateScreenSharingParticipant();
            
            // Force track subscription update after screenshare change
            setTimeout(() => {
                console.log('🔄 Updating track subscriptions after screenshare toggle');
                this.updateTrackSubscriptions();
            }, 1000);
            
        } catch (error) {
            console.error("❌ Error toggling screen share:", error);
            this.error = "Failed to toggle screen share. This may be due to browser permissions or network issues with large calls.";
            
            // Reset screenshare state on error
            this.isScreenSharing = false;
            this.updateScreenSharingParticipant();
        }
    }

    // NEW: Unified audio control methods for backstage users
    handleMainAudioVolumeChange(event: any): void {
        this.mainAudioVolume = parseFloat(event.target.value);
        this.updateAllAudioVolumes();
    }

    updateAllAudioVolumes(): void {
        // Update stage participant volumes
        Object.values(this.participants).forEach(participant => {
            if (participant.role === 'stage' && !participant.local) {
                this.setParticipantAudioVolume(participant.id, this.mainAudioVolume);
            }
        });
        
        // Update screenshare audio volume
        this.setScreenshareAudioVolume(this.mainAudioVolume);
    }

    updateStageVolumes(): void {
        Object.values(this.participants).forEach(participant => {
            if (participant.role === 'stage' && !participant.local) {
                this.setParticipantAudioVolume(participant.id, this.mainAudioVolume);
            }
        });
    }

    toggleMuteBackstage(): void {
        this.isBackstageMuted = !this.isBackstageMuted;
        console.log(`Toggling backstage mute to: ${this.isBackstageMuted}`);
        this.updateBackstageVolumes();
    }

    updateBackstageVolumes(): void {
        const newVolume = this.isBackstageMuted ? 0 : 1;
        const backstageParticipants = Object.values(this.participants).filter(p => p.role === 'backstage' && !p.local);
        
        // Removed excessive logging that fires constantly
        backstageParticipants.forEach(participant => {
            this.setParticipantAudioVolume(participant.id, newVolume);
        });
    }

    updateScreenshareAudioVolume(): void {
        // Removed excessive logging
        this.setScreenshareAudioVolume(this.mainAudioVolume);
    }

    private setParticipantAudioVolume(participantId: string, volume: number): void {
        try {
            let audioElementsFound = 0;
            const participant = this.participants[participantId];

            // Method 1: Find audio elements by data-participant-id attribute
            const audioElements = document.querySelectorAll(`audio[data-participant-id="${participantId}"]`);
            audioElements.forEach((audioElement: any) => {
                if (audioElement && typeof audioElement.volume !== 'undefined') {
                    audioElement.volume = Math.max(0, Math.min(1, volume));
                    audioElementsFound++;
                    // Enable autoplay for better audio experience
                    if (audioElement.paused) {
                        audioElement.play().catch(() => {/* Ignore autoplay failures */});
                    }
                }
            });

            // Method 2: Find by participant session ID in various selectors
            const participantElements = document.querySelectorAll(`[data-peer-id="${participantId}"]`);
            participantElements.forEach(element => {
                const audioEl = element.querySelector('audio');
                if (audioEl && typeof audioEl.volume !== 'undefined') {
                    audioEl.volume = Math.max(0, Math.min(1, volume));
                    audioElementsFound++;
                    if (audioEl.paused) {
                        audioEl.play().catch(() => {/* Ignore autoplay failures */});
                    }
                }
            });

            // Method 3: Find all audio elements and check if they belong to this participant
            const allAudioElements = document.querySelectorAll('audio');
            allAudioElements.forEach((audioElement: any) => {
                if (audioElement.srcObject && participant?.audioTrack) {
                    const tracks = audioElement.srcObject.getTracks ? audioElement.srcObject.getTracks() : [];
                    const hasParticipantTrack = tracks.some((track: any) => track.id === participant.audioTrack?.id);
                    if (hasParticipantTrack) {
                        audioElement.volume = Math.max(0, Math.min(1, volume));
                        audioElementsFound++;
                        if (audioElement.paused) {
                            audioElement.play().catch(() => {/* Ignore autoplay failures */});
                        }
                    }
                }
            });

            // Method 4: Try video-tile components that might have audio
            const videoTileElements = document.querySelectorAll('video-tile');
            videoTileElements.forEach(element => {
                const audioEl = element.querySelector('audio');
                const participantIdAttr = element.getAttribute('data-participant-id') || 
                                        element.querySelector('[data-peer-id]')?.getAttribute('data-peer-id');
                if (audioEl && participantIdAttr === participantId && typeof audioEl.volume !== 'undefined') {
                    audioEl.volume = Math.max(0, Math.min(1, volume));
                    audioElementsFound++;
                    if (audioEl.paused) {
                        audioEl.play().catch(() => {/* Ignore autoplay failures */});
                    }
                }
            });

            // Only log errors and missing elements, not successful operations
            if (audioElementsFound === 0) {
                // Only log missing elements occasionally to avoid spam
                if (Math.random() < 0.1) { // Log only 10% of the time
                    console.warn(`No audio elements found for participant ${participantId} (${participant?.role})`);
                }
            }
        } catch (error) {
            console.error('Error setting audio volume for participant:', participantId, error);
        }
    }

    private setScreenshareAudioVolume(volume: number): void {
        try {
            let audioElementsFound = 0;

            // Find all audio elements and check if they contain screen audio tracks
            const allAudioElements = document.querySelectorAll('audio');
            allAudioElements.forEach((audioElement: any) => {
                if (audioElement.srcObject) {
                    const tracks = audioElement.srcObject.getTracks ? audioElement.srcObject.getTracks() : [];
                    
                    // Check if any participant has a screenAudioTrack that matches this audio element's tracks
                    Object.values(this.participants).forEach(participant => {
                        if (participant.screenAudioTrack) {
                            const hasScreenAudioTrack = tracks.some((track: any) => 
                                track.id === participant.screenAudioTrack?.id
                            );
                            if (hasScreenAudioTrack) {
                                audioElement.volume = Math.max(0, Math.min(1, volume));
                                audioElementsFound++;
                                if (audioElement.paused) {
                                    audioElement.play().catch(() => {/* Ignore autoplay failures */});
                                }
                            }
                        }
                    });
                }
            });

            // Remove excessive logging - only log errors
        } catch (error) {
            console.error('Error setting screenshare audio volume:', error);
        }
    }

    private reapplyAllVolumeSettings(): void {
        // Removed excessive logging - this fires constantly
        try {
            // Reapply stage volumes
            this.updateStageVolumes();
            
            // Reapply backstage volumes
            this.updateBackstageVolumes();
            
            // Reapply screenshare audio volume
            this.setScreenshareAudioVolume(this.mainAudioVolume);
        } catch (error) {
            console.error('❌ Error reapplying volume settings:', error);
        }
    }

    // Method removed - recording setting is now controlled by the dropdown arrow in app component

    toggleLiveStream(): void {
        console.log('🎬 toggleLiveStream called', { 
            joined: this.joined, 
            callObject: !!this.callObject, 
            isLive: this.isLive 
        });

        if (!this.joined || !this.callObject) {
            console.warn('Cannot toggle live stream: not joined or no call object');
            return;
        }

        try {
            if (this.isLive) {
                console.log('🛑 Attempting to end live stream...');
                // End live stream - don't set state here, let the event handler do it
                this.endLiveStream();
            } else {
                console.log('▶️ Attempting to start live stream...');
                // Start live stream using current recording setting
                this.startLiveStream();
            }
        } catch (error) {
            console.error("Error toggling live stream:", error);
            this.error = "Failed to toggle live stream. Please try again.";
            setTimeout(() => { this.error = ''; }, 3000);
        }
    }

    private async startLiveStream(): Promise<void> {
        try {
            if (!this.callObject) {
                throw new Error('Call object not available');
            }
            
            // Check participant permissions
            const localParticipant = this.callObject.participants().local;
            console.log('📋 Checking permissions for live streaming...', {
                callObjectExists: !!this.callObject,
                joined: this.joined,
                participants: Object.keys(this.participants).length,
                localParticipant: localParticipant,
                permissions: localParticipant?.permissions
            });

            // Get layout options using the new helper method
            const layoutOptions = this.getStreamingLayoutOptions();
            
            const streamingConfig = {
                endpoints: [{
                    endpoint: 'rtmps://global-live.mux.com:443/app/e0e94784-65e3-51d8-caeb-d63bd898eca9'
                }],
                layout: layoutOptions,
                // HIGH QUALITY: Enhanced video settings
                width: 1920,           // Full HD width
                height: 1080,          // Full HD height  
                fps: 30,               // Smooth 30fps
                videoBitrate: 6000,    // 6 Mbps for high quality
                audioBitrate: 320      // High quality audio
            };
            
            console.log('🎥 Live streaming config:', streamingConfig);
            console.log('🚀 Calling startLiveStreaming...');
            
            const result = await this.callObject.startLiveStreaming(streamingConfig);
            console.log('✅ Live streaming start result:', result);
            
            // Start recording with the same layout configuration (if enabled)
            if (this.recordingEnabled) {
                const recordingOptions = {
                    layout: layoutOptions,
                    maxDuration: 86400, // 24 hours in seconds
                    minIdleTimeOut: 86400,  // Stop if empty/idle for 24 hours
                    // HIGH QUALITY: Enhanced recording settings
                    width: 1920,           // Full HD width
                    height: 1080,          // Full HD height
                    fps: 30,               // Smooth 30fps
                    videoBitrate: 8000,    // 8 Mbps for premium recording quality
                    audioBitrate: 320,     // High quality audio
                    videoCodec: 'H264'     // Efficient, high-quality codec
                };
                
                console.log('🎥 Starting cloud recording with config:', recordingOptions);
                const recordingResult = await this.callObject.startRecording(recordingOptions);
                console.log('✅ Cloud recording start result:', recordingResult);
            } else {
                console.log('⭕ Recording disabled - skipping cloud recording');
            }
            
        } catch (error) {
            console.error('❌ Failed to start live stream:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                error: error
            });
            this.error = `Failed to start live stream: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.liveStreamService.setLiveState(false);
        }
    }

    private async endLiveStream(): Promise<void> {
        try {
            if (!this.callObject) {
                throw new Error('Call object not available');
            }
            
            console.log('Ending live stream...', {
                callObjectExists: !!this.callObject,
                joined: this.joined
            });
            
            const result = await this.callObject.stopLiveStreaming();
            console.log('Live streaming stop result:', result);
            
            // Stop recording with stream (if it was started)
            if (this.recordingEnabled) {
                console.log('🛑 Stopping cloud recording...');
                const recordingStopResult = await this.callObject.stopRecording();
                console.log('✅ Cloud recording stop result:', recordingStopResult);
            } else {
                console.log('⭕ Recording was disabled - no recording to stop');
            }
            
        } catch (error) {
            console.error('Failed to stop live stream:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                error: error
            });
            this.error = 'Failed to stop live stream. Please try again.';
        }
    }

    private getStreamingLayoutOptions(): any {
        // Filter participants to get stage participant IDs
        const stageParticipantIds = Object.values(this.participants)
            .filter(participant => participant.role === 'stage')
            .map(participant => participant.id);

        console.log('🎯 Getting streaming layout options for stage participants:', stageParticipantIds);

        // Handle empty stage scenario
        if (stageParticipantIds.length === 0) {
            console.log('⚫ No stage participants - returning black background layout');
            return {
                preset: 'custom' as const,
                composition_id: 'daily:baseline',
                participants: { video: [], audio: [] },
                session_assets: { 
                    'logo': this.OVERLAY_IMAGE_URL 
                },
                composition_params: { 
                    'background-color': '#000000',
                    // Text overlay parameters (correct Daily.co VCS format)
                    'showTextOverlay': this.showTextOverlay,
                    'text.content': this.OVERLAY_TEXT,
                    'text.align_horizontal': 'right',
                    'text.align_vertical': 'bottom',
                    'text.fontFamily': 'DMSans',
                    'text.fontWeight': '600',
                    'text.fontSize_gu': 2.5,
                    'text.color': 'rgba(255, 255, 255, 0.95)',
                    'text.strokeColor': 'rgba(0, 0, 0, 0.8)',
                    'text.stroke_gu': 0.5,
                    // Image overlay parameters
                    'showImageOverlay': this.showImageOverlay,
                    'image.assetName': 'logo',
                    'image.position': 'top-right',
                    'image.height_gu': 6,
                    'image.margin_gu': 1.5,
                    'image.opacity': 1
                }
            };
        }

        // Handle non-empty stage scenario with VCS baseline composition
        console.log('🎭 Stage participants found, using VCS baseline composition for layout:', this.selectedLayout);
        
        // Base layout with participants filter and VCS configuration
        let initialVideoParticipants = stageParticipantIds;
        let initialAudioParticipants = stageParticipantIds;
        
        // For Presentation layout, we need to be more selective about participants
        if (this.selectedLayout === VideoLayout.PRESENTATION && this.screenSharingParticipant) {
            // For Presentation: ALWAYS show exactly ONE camera in sidebar (active speaker preferred)
            if (this.activeSpeakerId) {
                // Use active speaker - can be the same person as screen sharer
                initialVideoParticipants = [this.activeSpeakerId];
                console.log('📡 GUARANTEED 1 tile: Using active speaker for sidebar:', this.participants[this.activeSpeakerId]?.userName);
            } else {
                // No active speaker - use any ONE stage participant
                initialVideoParticipants = stageParticipantIds.length > 0 ? [stageParticipantIds[0]] : [];
                console.log('📡 GUARANTEED 1 tile: No active speaker - using first stage participant:', 
                    stageParticipantIds.length > 0 ? this.participants[stageParticipantIds[0]]?.userName : 'none');
            }
            
            console.log('📡 Presentation layout - filtering initial participants:', {
                originalStage: stageParticipantIds,
                screenSharer: this.screenSharingParticipant?.id,
                activeSpeaker: this.activeSpeakerId,
                filteredVideo: initialVideoParticipants,
                willShowBothScreenAndCamera: this.activeSpeakerId === this.screenSharingParticipant?.id
            });
        }
        
        const layout: any = {
            preset: 'custom' as const,
            composition_id: 'daily:baseline',
            participants: {
                video: initialVideoParticipants,
                audio: initialAudioParticipants
            },
            session_assets: { 
                'logo': this.OVERLAY_IMAGE_URL 
            },
            composition_params: {
                // Text overlay parameters (correct Daily.co VCS format)
                'showTextOverlay': this.showTextOverlay,
                'text.content': this.OVERLAY_TEXT,
                'text.align_horizontal': 'right',
                'text.align_vertical': 'bottom',
                'text.fontFamily': 'DMSans',
                'text.fontWeight': '600',
                'text.fontSize_gu': 2.5,
                'text.color': 'rgba(255, 255, 255, 0.95)',
                'text.strokeColor': 'rgba(0, 0, 0, 0.8)',
                'text.stroke_gu': 0.5,
                // Image overlay parameters
                'showImageOverlay': this.showImageOverlay,
                'image.assetName': 'logo',
                'image.position': 'top-right',
                'image.height_gu': 6,
                'image.margin_gu': 1.5,
                'image.opacity': 1
            }
        };

        // Map selectedLayout to VCS mode and add mode-specific parameters
        let vcsMode: string;
        switch (this.selectedLayout) {
            case VideoLayout.TILED:
                vcsMode = 'grid';
                break;
            case VideoLayout.PINNED_HORIZONTAL:
                vcsMode = 'dominant';
                break;
            case VideoLayout.PINNED_VERTICAL:
                vcsMode = 'dominant';
                break;
            case VideoLayout.FULL_SCREEN:
                vcsMode = 'single';
                break;
            case VideoLayout.PRESENTATION:
                vcsMode = 'dominant';
                break;
            default:
                vcsMode = 'grid';
        }
        
        // Add the VCS mode to composition params
        layout.composition_params.mode = vcsMode;

        // Add mode-specific VCS parameters
        if (vcsMode === 'single') {
            // Full Screen layout - single mode for screenshare only
            layout.composition_params['videoSettings.preferScreenshare'] = true;
            layout.composition_params['videoSettings.maxCamStreams'] = 1;
            layout.composition_params['videoSettings.omitAudioOnly'] = true;
            layout.composition_params['videoSettings.showParticipantLabels'] = true;
            if (this.screenSharingParticipant) {
                // Override participants to show only screenshare
                layout.participants.video = [{ session_id: this.screenSharingParticipant.id, trackName: 'screenVideo' }];
            }
        } else if (vcsMode === 'dominant') {
            layout.composition_params['videoSettings.preferScreenshare'] = true;
            layout.composition_params['videoSettings.maxCamStreams'] = stageParticipantIds.length;
            layout.composition_params['videoSettings.scaleMode'] = 'fit';
            layout.composition_params['videoSettings.showParticipantLabels'] = true;
            
            if (this.selectedLayout === VideoLayout.PINNED_VERTICAL) {
                // Screen share with thumbnails at bottom (properly centered)
                layout.composition_params['videoSettings.dominant.position'] = 'top';
                layout.composition_params['videoSettings.dominant.splitPos'] = 0.7;
                layout.composition_params['videoSettings.dominant.numChiclets'] = Math.min(5, stageParticipantIds.length);
                layout.composition_params['videoSettings.dominant.followDomFlag'] = false;
                layout.composition_params['videoSettings.dominant.itemInterval_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.outerPadding_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.splitMargin_gu'] = 0;
                layout.composition_params['videoSettings.showParticipantLabels'] = true;
            } else if (this.selectedLayout === VideoLayout.PINNED_HORIZONTAL) {
                // Screen share with thumbnails on right (properly configured)
                layout.composition_params['videoSettings.dominant.position'] = 'left';
                layout.composition_params['videoSettings.dominant.splitPos'] = 0.75;
                layout.composition_params['videoSettings.dominant.numChiclets'] = Math.min(5, stageParticipantIds.length);
                layout.composition_params['videoSettings.dominant.followDomFlag'] = false;
                layout.composition_params['videoSettings.dominant.itemInterval_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.outerPadding_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.splitMargin_gu'] = 0;
                layout.composition_params['videoSettings.showParticipantLabels'] = true;
            } else if (this.selectedLayout === VideoLayout.PRESENTATION) {
                // Presentation layout: 80/20 split with screenshare dominant, active speaker in right sidebar
                layout.composition_params['mode'] = 'dominant';
                layout.composition_params['videoSettings.dominant.position'] = 'left'; // Screenshare on left (80%)
                layout.composition_params['videoSettings.dominant.splitPos'] = 0.8; // 80/20 split
                layout.composition_params['videoSettings.maxCamStreams'] = 1; // Only one tile in sidebar
                layout.composition_params['videoSettings.omitAudioOnly'] = true;
                layout.composition_params['videoSettings.showParticipantLabels'] = true; // Show names for tracking
                layout.composition_params['videoSettings.prioritizeScreenshare'] = true; // Ensure screenshare gets priority
                layout.composition_params['videoSettings.dominant.followDomFlag'] = false; // Don't auto-switch dominant
                
                // Presentation layout relies on VCS automatic screenshare prioritization
                // We've filtered the participants list above to only include the active speaker for sidebar
                console.log('📡 Presentation layout - using VCS auto-screenshare with active speaker:', {
                    screenSharer: this.screenSharingParticipant?.userName,
                    sidebarParticipant: initialVideoParticipants.map(id => this.participants[id]?.userName),
                    showingBothTracksForSamePerson: this.activeSpeakerId === this.screenSharingParticipant?.id,
                    maxCamStreams: layout.composition_params['videoSettings.maxCamStreams']
                });
            }
            
            if (this.selectedLayout !== VideoLayout.PRESENTATION) {
                layout.composition_params['videoSettings.dominant.numChiclets'] = Math.min(5, stageParticipantIds.length);
                layout.composition_params['videoSettings.dominant.followDomFlag'] = false;
                layout.composition_params['videoSettings.dominant.itemInterval_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.outerPadding_gu'] = 0.2;
                layout.composition_params['videoSettings.dominant.splitMargin_gu'] = 0;
            }
        } else {
            // Grid mode settings
            layout.composition_params['videoSettings.showParticipantLabels'] = true;
        }

        console.log('🎥 Final VCS layout config with overlays:', {
            preset: layout.preset,
            composition_id: layout.composition_id,
            mode: vcsMode,
            participantCount: stageParticipantIds.length,
            screenSharing: !!this.screenSharingParticipant,
            textOverlay: this.showTextOverlay,
            imageOverlay: this.showImageOverlay,
            session_assets: layout.session_assets,
            overlay_params: {
                showTextOverlay: layout.composition_params.showTextOverlay,
                showImageOverlay: layout.composition_params.showImageOverlay,
                textContent: layout.composition_params['text.content']
            }
        });
        
        console.log('Full layout object:', JSON.stringify(layout, null, 2));
        
        return layout;
    }



    // Simplified layout options for updates (no composition_id or session_assets needed)
    private getStreamingLayoutOptionsForUpdate(): any {
        // Filter participants to get stage participant IDs
        const stageParticipantIds = Object.values(this.participants)
            .filter(participant => participant.role === 'stage')
            .map(participant => participant.id);

        console.log('🎯 Getting streaming layout update options for stage participants:', stageParticipantIds);

        // Handle empty stage scenario
        if (stageParticipantIds.length === 0) {
            console.log('⚫ No stage participants - returning black background layout for update');
            return {
                preset: 'custom' as const,
                participants: { video: [], audio: [] },
                composition_params: { 
                    'background-color': '#000000',
                    // Text overlay parameters
                    'showTextOverlay': this.showTextOverlay,
                    'text.content': this.OVERLAY_TEXT,
                    'text.align_horizontal': 'right',
                    'text.align_vertical': 'bottom',
                    'text.fontFamily': 'DMSans',
                    'text.fontWeight': '600',
                    'text.fontSize_gu': 2.5,
                    'text.color': 'rgba(255, 255, 255, 0.95)',
                    'text.strokeColor': 'rgba(0, 0, 0, 0.8)',
                    'text.stroke_gu': 0.5,
                    // Image overlay parameters
                    'showImageOverlay': this.showImageOverlay,
                    'image.assetName': 'logo',
                    'image.position': 'top-right',
                    'image.height_gu': 6,
                    'image.margin_gu': 1.5,
                    'image.opacity': 1
                }
            };
        }

        // Use simplified VCS configuration without complex explicit video tracks
        let updateMode = 'grid';
        if (this.selectedLayout === VideoLayout.TILED) {
            updateMode = 'grid';
        } else if (this.selectedLayout === VideoLayout.FULL_SCREEN) {
            updateMode = 'single';
        } else {
            updateMode = 'dominant';
        }

        // STRICT PARTICIPANT FILTERING FOR PRESENTATION LAYOUT
        let videoParticipants = stageParticipantIds;

        // Create the layout object
        const updateLayout: any = {
            preset: 'custom' as const,
            participants: {
                video: videoParticipants,
                audio: stageParticipantIds // Keep all stage participants for audio
            },
            composition_params: {
                mode: updateMode,
                ...(updateMode !== 'grid' && updateMode !== 'single' && {
                    'videoSettings.preferScreenshare': true,
                    'videoSettings.maxCamStreams': this.selectedLayout === VideoLayout.PRESENTATION ? 1 : stageParticipantIds.length,
                    'videoSettings.scaleMode': 'fit',
                    'videoSettings.showParticipantLabels': true
                }),
                ...(updateMode === 'single' && {
                    'videoSettings.preferScreenshare': true,
                    'videoSettings.maxCamStreams': 1,
                    'videoSettings.omitAudioOnly': true,
                    'videoSettings.showParticipantLabels': true
                }),
                ...(this.selectedLayout === VideoLayout.PRESENTATION && {
                    'videoSettings.dominant.position': 'left',           // Screen on left, sidebar on right
                    'videoSettings.dominant.splitPos': 0.8,              // 80/20 split
                    'videoSettings.followDomFlag': true,
                    'videoSettings.maxCamStreams': 2,                    // Allow exactly 2 streams: 1 Screen + 1 Camera
                    'videoSettings.scaleMode': 'fill',
                    'videoSettings.dominant.numChiclets': 1,             // Force exactly 1 sidebar tile
                    'videoSettings.showParticipantLabels': true,         // Show participant names
                    'videoSettings.preferScreenshare': true,             // Ensure screen takes dominant position
                    'showParticipantLabels': true                        // Additional label enforcement
                }),
                ...(this.selectedLayout === VideoLayout.PINNED_VERTICAL && {
                    'videoSettings.dominant.position': 'top',
                    'videoSettings.dominant.splitPos': 0.7,
                    'videoSettings.dominant.numChiclets': Math.min(5, stageParticipantIds.length),
                    'videoSettings.dominant.followDomFlag': false,
                    'videoSettings.dominant.itemInterval_gu': 0.2,
                    'videoSettings.dominant.outerPadding_gu': 0.2,
                    'videoSettings.dominant.splitMargin_gu': 0,
                    'videoSettings.showParticipantLabels': true
                }),
                ...(this.selectedLayout === VideoLayout.PINNED_HORIZONTAL && {
                    'videoSettings.dominant.position': 'left',
                    'videoSettings.dominant.splitPos': 0.75,
                    'videoSettings.dominant.numChiclets': Math.min(5, stageParticipantIds.length),
                    'videoSettings.dominant.followDomFlag': false,
                    'videoSettings.dominant.itemInterval_gu': 0.2,
                    'videoSettings.dominant.outerPadding_gu': 0.2,
                    'videoSettings.dominant.splitMargin_gu': 0,
                    'videoSettings.showParticipantLabels': true
                }),
                // Text overlay parameters
                'showTextOverlay': this.showTextOverlay,
                'text.content': this.OVERLAY_TEXT,
                'text.align_horizontal': 'right',
                'text.align_vertical': 'bottom',
                'text.fontFamily': 'DMSans',
                'text.fontWeight': '600',
                'text.fontSize_gu': 2.5,
                'text.color': 'rgba(255, 255, 255, 0.95)',
                'text.strokeColor': 'rgba(0, 0, 0, 0.8)',
                'text.stroke_gu': 0.5,
                // Image overlay parameters
                'showImageOverlay': this.showImageOverlay,
                'image.assetName': 'logo',
                'image.position': 'top-right',
                'image.height_gu': 6,
                'image.margin_gu': 1.5,
                'image.opacity': 1
            }
        };

        // PRESENTATION LAYOUT: Clean approach - use regular participant IDs
        if (this.selectedLayout === VideoLayout.PRESENTATION) {
            // Simple: Send all stage participants, let VCS handle the layout with preferScreenshare
            updateLayout.participants.video = stageParticipantIds;
        }

        return updateLayout;
    }

    // Live streaming event handlers
    handleLiveStreamingStarted = (event: any): void => {
        console.log('🔴 Live streaming started event received:', event);
        console.log('Event details:', JSON.stringify(event, null, 2));
        this.liveStreamService.setLiveState(true);
    };

    handleLiveStreamingStopped = (event: any): void => {
        console.log('⏹️ Live streaming stopped event received:', event);
        console.log('Event details:', JSON.stringify(event, null, 2));
        this.liveStreamService.setLiveState(false);
    };

    handleLiveStreamingError = (event: any): void => {
        console.error('❌ Live streaming error event received:', event);
        console.error('Error event details:', JSON.stringify(event, null, 2));
        this.error = 'Live streaming error occurred. Please try again.';
        this.liveStreamService.setLiveState(false);
    };

    // Helper method to get local participant for AV controls
    getLocalParticipant(): Participant | null {
        try {
            const localSessionId = this.getCurrentUserSessionId();
            return localSessionId ? this.participants[localSessionId] || null : null;
        } catch (error) {
            console.warn('Failed to get local participant:', error);
            return null;
        }
    }

    // Helper method to get current user's session ID
    private getCurrentUserSessionId(): string | null {
        try {
            const localParticipant = this.callObject?.participants()?.local;
            return localParticipant?.session_id || null;
        } catch (error) {
            console.warn('Could not get current user session ID:', error);
            return null;
        }
    }

    // Handle active speaker changes
    handleActiveSpeakerChange = (event: any): void => {
        // DEBUG: Log ALL active speaker events to see what we're getting
        console.log('🔍 Active speaker event received:', {
            event: event,
            hasActiveSpeaker: !!(event && event.activeSpeaker),
            peerId: event?.activeSpeaker?.peerId,
            currentActiveSpeaker: this.activeSpeakerId
        });
        
        // Daily.js fires this event with a peerId when someone speaks, 
        // and usually with null/undefined when everyone stops talking (silence).
        
        // STICKY BEHAVIOR: We only care if there is a valid peerId (someone is talking).
        // We IGNORE silence to keep the last speaker visible in the presentation sidebar.
        if (event && event.activeSpeaker && event.activeSpeaker.peerId) {
            const newActiveSpeakerId = event.activeSpeaker.peerId;
            console.log('🔍 Valid peerId found:', newActiveSpeakerId, 'Current:', this.activeSpeakerId);
            
            // Only update if the active speaker actually changed to a NEW person
            if (this.activeSpeakerId !== newActiveSpeakerId) {
                this.activeSpeakerId = newActiveSpeakerId;
                console.log('🎤 Active speaker changed to:', this.activeSpeakerId);
                
                // Update track subscriptions to bump new speaker to high quality
                this.updateTrackSubscriptions();
                
                // Trigger change detection to update the local UI sidebar immediately
                this.cdr.detectChanges();
            } else {
                console.log('🔍 Same speaker - no change needed');
            }
        } else {
            console.log('🔍 No valid peerId - ignoring (sticky behavior)');
        }
    };

    // Get participant for presentation sidebar (active speaker with screen sharer fallback)
    getPresentationSidebarParticipant(): Participant[] {
        // Priority 1: Use active speaker if they exist and are on stage
        if (this.activeSpeakerId) {
            const activeSpeaker = this.participants[this.activeSpeakerId];
            if (activeSpeaker && activeSpeaker.role === 'stage') {
                console.log('🎯 Presentation sidebar: Using active speaker', activeSpeaker.userName);
                return [activeSpeaker];
            }
        }
        
        // Priority 2: Use screen sharer as fallback (they were likely speaking when they started sharing)
        if (this.screenSharingParticipant && this.screenSharingParticipant.role === 'stage') {
            console.log('🎯 Presentation sidebar: Using screen sharer as fallback', this.screenSharingParticipant.userName);
            return [this.screenSharingParticipant];
        }
        
        // Priority 3: Any other stage participant
        const stageParticipants = this.getStageParticipants();
        const fallbackParticipant = stageParticipants.find(p => 
            p.id !== this.screenSharingParticipant?.id
        );
        
        if (fallbackParticipant) {
            console.log('🎯 Presentation sidebar: Using fallback stage participant', fallbackParticipant.userName);
            return [fallbackParticipant];
        }
        
        return [];
    }

    updateScreenSharingParticipant(): void {
        let applyScreenshareLayout = false;
        const previousScreenSharingParticipant = this.screenSharingParticipant;
        const participantCount = Object.keys(this.participants).length;
        
        if (this.screenSharingParticipant === null) {
            applyScreenshareLayout = true;
        }
        // Only consider stage participants for screen sharing in live stream
        const sharingParticipant = Object.values(this.participants).find(p => 
            p.screenVideoReady && p.role === 'stage'
        );
        
        const previousId = this.screenSharingParticipant?.id;
        const newId = sharingParticipant?.id;
        
        this.screenSharingParticipant = sharingParticipant || null;
        
        // Log screenshare changes in large calls for debugging
        if (participantCount > 8 && previousId !== newId) {
            console.log('🖥️ Screenshare participant changed in large call:', {
                participantCount,
                previous: previousId ? this.participants[previousId]?.userName : 'none',
                current: sharingParticipant?.userName || 'none',
                isLocal: sharingParticipant?.local || false
            });
        }
        
        // Update screenshare audio volume when screen sharing starts/stops
        if (this.screenSharingParticipant && this.screenSharingParticipant.screenAudioTrack) {
            setTimeout(() => {
                this.setScreenshareAudioVolume(this.mainAudioVolume);
            }, 100);
        }
        
        // CRITICAL FIX: Reapply all volumes when screen sharing changes
        // This prevents the browser from resetting volumes during stream changes
        this.debouncedVolumeReapply();
        
        // Force track subscription update when screenshare changes in large calls
        if (participantCount > 8 && previousId !== newId) {
            setTimeout(() => {
                console.log('🔄 Updating track subscriptions due to screenshare change in large call');
                this.updateTrackSubscriptions();
            }, 300);
        }
        
        // Update live stream if currently streaming and screen sharing status changed
        if (this.isLive && previousScreenSharingParticipant !== this.screenSharingParticipant) {
            console.log('🔄 Live stream is active - updating due to screen sharing change...');
            try {
                console.log('🔄 Updating live stream with new screen sharing layout...');
                
                // Update live streaming layout asynchronously
                (async () => {
                    try {
                        const newLayoutOptions = this.getStreamingLayoutOptionsForUpdate();
                        await this.callObject!.updateLiveStreaming({ 
                            layout: newLayoutOptions 
                        });
                        console.log('✅ Live stream updated for screen sharing change');
                        
                        // Sync recording layout update (if recording is enabled)
                        if (this.recordingEnabled) {
                            try {
                                await this.callObject!.updateRecording({ layout: newLayoutOptions });
                                console.log('✅ Cloud recording layout updated for screen sharing change');
                            } catch (recordingUpdateError) {
                                console.warn('⚠️ Failed to update recording layout for screen sharing (may be initializing):', recordingUpdateError);
                            }
                        }
                    } catch (updateError: any) {
                        console.error('❌ Failed to update live stream for screen sharing:', updateError);
                        this.error = 'Failed to update live stream for screen sharing. Please try again.';
                        setTimeout(() => { this.error = ''; }, 5000);
                    }
                })();
            } catch (error) {
                console.error('❌ Error preparing screen sharing layout update:', error);
            }
        }
        
        if (this.screenSharingParticipant === null) {
            this.selectedLayout = VideoLayout.TILED;
            this.reCalculateLayoutData();
        } else if (applyScreenshareLayout) {
            // Switch to pinned horizontal layout when someone starts sharing
            this.selectedLayout = VideoLayout.PINNED_HORIZONTAL;
            this.reCalculateLayoutData();
        }
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

    async updateTrackSubscriptions(): Promise<void> {
        if (!this.callObject || !this.joined) return;

        try {
            const updateObject: any = {};
            const qualitySettings: any = {};
            let screenSharerDetected = false;

            Object.values(this.participants).forEach(participant => {
                if (participant.local) return;

                let shouldSubscribeAudio = false;

                if (this.localParticipantRole === 'backstage') {
                    shouldSubscribeAudio = true;
                }
                else if (this.localParticipantRole === 'stage') {
                    shouldSubscribeAudio = participant.role === 'stage';
                }

                // Determine if participant is primary (high priority)
                const isScreenSharer = participant.id === this.screenSharingParticipant?.id;
                const isActiveSpeaker = participant.id === this.activeSpeakerId;
                const isPrimary = isScreenSharer || isActiveSpeaker;
                
                if (isScreenSharer) {
                    screenSharerDetected = true;
                    console.log('🖥️ Subscribing to screen share from:', participant.userName);
                }

                // Configure track subscriptions with explicit screenshare priority
                updateObject[participant.id] = {
                    setSubscribedTracks: {
                        audio: shouldSubscribeAudio,
                        video: true, // Subscribe to camera for all participants
                        screenVideo: true,    // CRITICAL: Always subscribe to screenshare
                        screenAudio: true     // CRITICAL: Always subscribe to screenshare audio
                    }
                };
                
                // Configure quality settings - screenshare gets highest priority
                if (isScreenSharer) {
                    // Screenshare always gets maximum quality (layer 2)
                    qualitySettings[participant.id] = {
                        video: { layer: 2 },         // Max camera quality for screen sharer
                        screenVideo: { layer: 2 }     // Max screenshare quality
                    };
                } else if (isActiveSpeaker) {
                    // Active speaker gets high camera quality
                    qualitySettings[participant.id] = {
                        video: { layer: 2 }           // High camera quality for speaker
                    };
                } else {
                    // Other participants get lower camera quality to preserve bandwidth
                    qualitySettings[participant.id] = {
                        video: { layer: 0 }           // Low camera quality for others
                    };
                }
            });

            // Apply track subscriptions
            if (Object.keys(updateObject).length > 0) {
                console.log('📡 Updating track subscriptions for', Object.keys(updateObject).length, 'participants');
                if (screenSharerDetected) {
                    console.log('🖥️ Screen share detected - ensuring proper subscription');
                }
                
                this.callObject.updateParticipants(updateObject);
                
                // Apply quality settings after subscription update with delay
                if (Object.keys(qualitySettings).length > 0) {
                    setTimeout(async () => {
                        try {
                            await this.callObject?.updateReceiveSettings(qualitySettings);
                            console.log('✅ Quality settings applied successfully');
                        } catch (qualityError) {
                            console.warn('⚠️ Could not apply quality settings:', qualityError);
                        }
                    }, 500);
                }
            }

        } catch (error: any) {
            console.error('❌ Error updating track subscriptions:', error);
            this.error = `Error updating track subscriptions: ${error.message}`;
            
            // Retry logic for subscription failures with 10+ people
            setTimeout(() => {
                console.log('🔄 Retrying track subscriptions after error...');
                this.updateTrackSubscriptions();
            }, 2000);
        }
    }

    toggleVirtualBgMenu(): void {
        this.showVirtualBgMenu = !this.showVirtualBgMenu;
        // Reset loading state to prevent hanging spinner if menu was closed while loading
        this.isLoadingVirtualBg = false;
    }
    
    // NEW: Handle overlay toggle from service
    private handleOverlayToggle(type: 'text' | 'image'): void {
        if (!this.joined || !this.callObject) return;
        
        let newValue: boolean;
        if (type === 'text') {
            newValue = !this.showTextOverlay;
            this.showTextOverlay = newValue;
            this.liveStreamService.setTextOverlayState(newValue);
        } else {
            newValue = !this.showImageOverlay;
            this.showImageOverlay = newValue;
            this.liveStreamService.setImageOverlayState(newValue);
        }
        
        console.log(`🎨 Toggling ${type} overlay to:`, newValue);
        console.log(`🔍 Current overlay states - Text: ${this.showTextOverlay}, Image: ${this.showImageOverlay}`);
        
        // Sync state with other users
        this.callObject.sendAppMessage({
            type: 'OVERLAY_UPDATE',
            overlay: type,
            visible: newValue
        }, '*');
        
        // Update live stream layout if currently streaming
        this.updateLiveStreamLayout();
        
        // Force change detection
        this.cdr.detectChanges();
    }
    
    // NEW: Helper method to update live stream layout
    private updateLiveStreamLayout(): void {
        if (this.isLive && this.callObject) {
            try {
                const newLayoutOptions = this.getStreamingLayoutOptionsForUpdate();
                
                (async () => {
                    try {
                        await this.callObject!.updateLiveStreaming({ 
                            layout: newLayoutOptions 
                        });
                        console.log('✅ Live stream layout updated');
                        
                        // Sync recording layout update (if recording is enabled)
                        if (this.recordingEnabled) {
                            try {
                                await this.callObject!.updateRecording({ layout: newLayoutOptions });
                                console.log('✅ Cloud recording layout updated for overlay change');
                            } catch (recordingUpdateError) {
                                console.warn('⚠️ Failed to update recording layout for overlay change (may be initializing):', recordingUpdateError);
                            }
                        }
                    } catch (updateError: any) {
                        console.error('❌ Failed to update live stream layout for overlay change:', updateError);
                        this.error = 'Failed to update live stream layout for overlay change. Please try again.';
                        setTimeout(() => { this.error = ''; }, 5000);
                    }
                })();
            } catch (error) {
                console.error('❌ Error preparing overlay layout update:', error);
            }
        }
    }

    // Recording toggle functionality is now handled through the Go Live dropdown

    async applyVirtualBackground(option: VirtualBackgroundOption): Promise<void> {
        // Prevent applying if already loading or if the same background is selected
        if (this.isLoadingVirtualBg) return;
        
        if (option.type === this.currentVirtualBg && option.value === this.currentVirtualBgValue) {
            this.showVirtualBgMenu = false; // Just close menu if already active
            return;
        }

        if (!this.callObject || !this.joined) return;

        this.isLoadingVirtualBg = true;
        let success = false;

        try {
            // CPU OPTIMIZATION: Log performance tips when enabling virtual background
            if (option.type !== 'none' && this.currentVirtualBg === 'none') {
                console.log('🎭 Enabling virtual background - applying CPU optimizations...');
                this.logVirtualBackgroundPerformanceTips();
            }

            if (option.type === 'none') {
                console.log('🚫 Disabling virtual background - CPU usage should decrease');
                await this.callObject.updateInputSettings({
                    video: { processor: { type: 'none' } }
                });
                this.currentVirtualBg = 'none';
                this.currentVirtualBgValue = null;
                success = true;
            } else if (option.type === 'blur') {
                console.log('🌫️ Applying background blur with performance optimization...');
                // CPU OPTIMIZATION: Use lower blur strength for better performance
                await this.callObject.updateInputSettings({
                    video: { 
                        processor: { 
                            type: 'background-blur', 
                            config: { strength: 0.7 }  // Slightly reduced strength for better performance
                        } 
                    }
                });
                this.currentVirtualBg = 'blur';
                this.currentVirtualBgValue = null;
                success = true;
                
                // CPU OPTIMIZATION: Start performance monitoring
                setTimeout(() => this.monitorVirtualBackgroundPerformance(), 2000);
                
            } else if (option.type === 'image' && option.value) {
                console.log('🖼️ Applying background image - this is the most CPU intensive option');
                const imageArrayBuffer = await this.loadImageAsArrayBuffer(option.value);
                await this.callObject.updateInputSettings({
                    video: { processor: { type: 'background-image', config: { source: imageArrayBuffer } } }
                });
                this.currentVirtualBg = 'image';
                this.currentVirtualBgValue = option.value;
                success = true;
                
                // CPU OPTIMIZATION: Monitor performance for image backgrounds (most intensive)
                setTimeout(() => this.monitorVirtualBackgroundPerformance(), 2000);
                
                // Additional tip for image backgrounds
                console.log('💡 Performance tip: Background blur typically uses less CPU than custom images');
            }

            if (success) {
                this.showVirtualBgMenu = false;
                
                // CPU OPTIMIZATION: Log final status
                const bgTypeEmoji = option.type === 'none' ? '🚫' : option.type === 'blur' ? '🌫️' : '🖼️';
                console.log(`✅ ${bgTypeEmoji} Virtual background applied: ${option.type}`);
                
                if (option.type !== 'none') {
                    console.log('💡 To improve performance: ensure good lighting and close other applications');
                }
            }

        } catch (error: any) {
            console.error('❌ Error applying virtual background:', error);
            
            // CPU OPTIMIZATION: Provide helpful error context
            let errorMessage = `Failed to apply virtual background: ${error.message || 'Please try again.'}`;
            if (error.message?.includes('processor') || error.message?.includes('model')) {
                errorMessage += ' This may be due to high CPU usage or device limitations.';
            }
            
            this.error = errorMessage;
            setTimeout(() => { this.error = ''; }, 5000);
        } finally {
            this.isLoadingVirtualBg = false;
            this.cdr.detectChanges();
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

    changeLayout(layout: VideoLayout): void {
        if (!this.callObject || !this.joined) return;
        if (this.isLayoutDisabled(layout)) {
            console.warn('Cannot switch to this layout due to screen share status.');
            return;
        }
        this.selectedLayout = layout;
        this.showLayoutMenu = false;

        // Broadcast layout change to all participants
        this.callObject.sendAppMessage({
            type: 'LAYOUT_CHANGE',
            layout: layout
        });
        console.log('📡 Broadcasted layout change to all participants:', layout);

        // Update live stream layout if currently streaming
        this.updateLiveStreamLayout();

        console.log('Layout changed to:', layout);
        this.reCalculateLayoutData();
    }

    isLayoutDisabled(layout: VideoLayout): boolean {
        // When screen sharing is inactive, layouts 2,3,4,5 should be disabled
        if (!this.isScreenSharing && (layout === VideoLayout.PINNED_VERTICAL || layout === VideoLayout.PINNED_HORIZONTAL || layout === VideoLayout.FULL_SCREEN || layout === VideoLayout.PRESENTATION)) {
            return true;
        }
        // When screen sharing is active, layout 1 (TILED) should be disabled
        if (this.isScreenSharing && layout === VideoLayout.TILED) {
            return true;
        }
        return false;
    }

    private static readonly ASPECT_RATIO = 16 / 9;
    private static readonly DEFAULT_PADDING = 16;
    private static readonly DEFAULT_GAP = 8;
    private static readonly MIN_TILE_SIZE = 80;
    
    // Performance optimization: Debounce layout recalculations
    private layoutRecalcTimeout?: number;
    private readonly LAYOUT_RECALC_DEBOUNCE = 100; // ms
    
    // Performance optimization: Debounce volume reapplication
    private volumeReapplyTimeout?: number;
    private readonly VOLUME_REAPPLY_DEBOUNCE = 50; // ms

    private getContainerDimensions(element: HTMLElement): { width: number; height: number } | null {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    }

    private getCachedElement(selector: string): HTMLElement | null {
        const element = document.querySelector(selector) as HTMLElement;
        return element || null;
    }

    // Debounced version to prevent excessive layout recalculations
    reCalculateLayoutData = (): void => {
        if (this.layoutRecalcTimeout) {
            clearTimeout(this.layoutRecalcTimeout);
        }
        
        this.layoutRecalcTimeout = window.setTimeout(() => {
            this.performLayoutCalculation();
        }, this.LAYOUT_RECALC_DEBOUNCE);
    };

    private performLayoutCalculation(): void {
        if (this.selectedLayout === VideoLayout.TILED) {
            this.applyTiledLayout();
        } else if (this.selectedLayout === VideoLayout.PINNED_VERTICAL) {
            this.applyPinnedHorizontalLayout()
        } else if (this.selectedLayout === VideoLayout.PINNED_HORIZONTAL) {
            this.applyPinnedVerticalLayout()
        }
    }

    // Debounced volume reapplication to prevent excessive calls
    private debouncedVolumeReapply(): void {
        if (this.volumeReapplyTimeout) {
            clearTimeout(this.volumeReapplyTimeout);
        }
        
        this.volumeReapplyTimeout = window.setTimeout(() => {
            this.reapplyAllVolumeSettings();
            this.cdr.detectChanges(); // Trigger change detection only when needed
        }, this.VOLUME_REAPPLY_DEBOUNCE);
    }

    private startAudioHealthMonitoring(): void {
        if (!this.safariAudioService.isSafariBrowser()) return;
        
        this.audioHealthCheckInterval = setInterval(() => {
            this.checkAudioHealth();
        }, this.AUDIO_HEALTH_CHECK_INTERVAL);
    }

    private checkAudioHealth(): void {
        if (!this.joined || !this.safariAudioService.isSafariBrowser()) return;
        
        // Check if AudioContext is still running
        if (!this.safariAudioService.isAudioContextRunning()) {
            console.warn('🚨 Safari AudioContext not running, attempting recovery...');
            this.safariAudioService.resumeAudioContext();
            return;
        }
        
        // Check for silent audio elements that should be playing
        const audioElements = document.querySelectorAll('audio');
        let deadAudioDetected = false;
        
        audioElements.forEach((audioEl: any) => {
            if (audioEl.srcObject && !audioEl.paused) {
                // Audio element should be playing but might be silent
                // Check if tracks are active
                const tracks = audioEl.srcObject.getTracks();
                const hasActiveTracks = tracks.some((track: MediaStreamTrack) => 
                    track.readyState === 'live' && track.enabled
                );
                
                if (!hasActiveTracks) {
                    deadAudioDetected = true;
                }
            }
        });
        
        if (deadAudioDetected) {
            console.warn('🚨 Dead audio tracks detected, forcing reconnection...');
            this.safariAudioService.forceReconnectAllAudio();
        }
    }
    
    // SCREENSHARE MONITORING: Start periodic screenshare health monitoring
    private startScreenshareHealthMonitoring(): void {
        if (this.screenshareHealthCheckInterval) {
            clearInterval(this.screenshareHealthCheckInterval);
        }
        
        this.screenshareHealthCheckInterval = setInterval(() => {
            this.checkScreenshareHealth();
        }, this.SCREENSHARE_HEALTH_CHECK_INTERVAL);
    }
    
    // SCREENSHARE MONITORING: Check if screenshare is working properly with many participants
    private checkScreenshareHealth(): void {
        const participantCount = Object.keys(this.participants).length;
        
        // Only monitor in large calls (8+ participants)
        if (participantCount < 8) return;
        
        // Check if someone is supposed to be screensharing but others can't see it
        const localIsSharing = this.isScreenSharing;
        const remoteScreenshares = Object.values(this.participants).filter(p => 
            !p.local && p.screenVideoReady
        );
        
        // If local is sharing but we detect subscription issues
        if (localIsSharing && participantCount > 10) {
            console.log('🔍 Screenshare health check:', {
                localSharing: localIsSharing,
                remoteScreenshares: remoteScreenshares.length,
                totalParticipants: participantCount,
                screenSharingParticipant: this.screenSharingParticipant?.userName
            });
            
            // Force track subscription refresh if screenshare might be failing
            if (Math.random() < 0.3) { // 30% chance to refresh subscriptions
                console.log('🔄 Refreshing track subscriptions for screenshare reliability');
                this.updateTrackSubscriptions();
            }
        }
        
        // Monitor for screenshare failures (when local is sharing but track isn't detected)
        if (localIsSharing && !this.screenSharingParticipant) {
            this.screenshareFailureCount++;
            console.warn(`⚠️ Screenshare failure detected (${this.screenshareFailureCount}/3): Local sharing but no track found`);
            
            if (this.screenshareFailureCount >= 3) {
                console.error('❌ Screenshare appears to have failed - attempting recovery');
                this.recoverScreenshare();
            }
        }
    }
    
    // SCREENSHARE RECOVERY: Attempt to recover from screenshare failures
    private async recoverScreenshare(): Promise<void> {
        try {
            console.log('🔧 Attempting screenshare recovery...');
            
            // Stop and restart screenshare
            if (this.isScreenSharing) {
                await this.callObject?.stopScreenShare();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.callObject?.startScreenShare();
                console.log('✅ Screenshare recovery attempted');
            }
            
            // Reset failure count
            this.screenshareFailureCount = 0;
            
        } catch (error) {
            console.error('❌ Screenshare recovery failed:', error);
            this.error = 'Screen sharing may not be working properly in this large call. Try stopping and restarting.';
            setTimeout(() => { this.error = ''; }, 5000);
        }
    }
    
    // VIRTUAL BACKGROUND PERFORMANCE: Monitor and adaptively adjust settings
    private monitorVirtualBackgroundPerformance(): void {
        // Monitor performance when virtual background is active
        if ('memory' in performance) {
            const memInfo = (performance as any).memory;
            const usagePercent = (memInfo.usedJSHeapSize / memInfo.totalJSHeapSize * 100).toFixed(1);
            
            if (memInfo.usedJSHeapSize > memInfo.totalJSHeapSize * 0.8) {
                console.warn(`⚠️ High memory usage detected (${usagePercent}%) with virtual background - performance may be impacted`);
                console.warn('💡 Tip: Close other applications or disable virtual background to improve performance');
            } else {
                console.log(`📊 Memory usage: ${usagePercent}% - virtual background performance OK`);
            }
        }
        
        // Log performance tips
        this.logVirtualBackgroundPerformanceTips();
    }

    private applyTiledLayout(): void {
        timer(100).subscribe(() => {
            const container = this.getCachedElement('.tiled-container');
            const grid = this.getCachedElement('.tiled-grid');
            if (!container || !grid || this.getStageParticipants().length === 0) return;

            const dimensions = this.getContainerDimensions(container);
            if (!dimensions) {
                return;
            }

            this.calculateTiledLayoutDimensions(dimensions.width, dimensions.height, this.getStageParticipants().length, grid);

        });
    }

    private calculateTiledLayoutDimensions(
        containerWidth: number,
        containerHeight: number,
        videoCount: number,
        gridElement: HTMLElement
    ): void {
        if (videoCount === 0) return;

        const availableWidth = containerWidth - VideoGroupComponent.DEFAULT_PADDING;
        const availableHeight = containerHeight - VideoGroupComponent.DEFAULT_PADDING;

        const layout = this.findOptimalTiledLayout(
            availableWidth,
            availableHeight,
            videoCount,
            VideoGroupComponent.ASPECT_RATIO,
            VideoGroupComponent.DEFAULT_GAP
        );

        this.applyGridStyles(gridElement, layout);
    }

    private findOptimalTiledLayout(
        containerWidth: number,
        containerHeight: number,
        videoCount: number,
        aspectRatio: number,
        gap: number
    ): { width: number; height: number; cols: number; rows: number } {
        let bestLayout = { area: 0, cols: 1, rows: 1, width: 0, height: 0 };

        for (let cols = 1; cols <= videoCount; cols++) {
            const rows = Math.ceil(videoCount / cols);
            const layout = this.calculateGridLayout(containerWidth, containerHeight, cols, rows, aspectRatio, gap);

            if (layout.area > bestLayout.area) {
                bestLayout = { ...layout, cols, rows };
            }
        }

        return bestLayout;
    }

    private calculateGridLayout(
        containerWidth: number,
        containerHeight: number,
        cols: number,
        rows: number,
        aspectRatio: number,
        gap: number
    ): { width: number; height: number; area: number } {
        const availableWidthForTiles = containerWidth - (gap * (cols - 1));
        const availableHeightForTiles = containerHeight - (gap * (rows - 1));

        const hScale = availableWidthForTiles / (cols * aspectRatio);
        const vScale = availableHeightForTiles / rows;

        let width: number, height: number;

        if (hScale <= vScale) {
            width = Math.floor(availableWidthForTiles / cols);
            height = Math.floor(width / aspectRatio);
        } else {
            height = Math.floor(availableHeightForTiles / rows);
            width = Math.floor(height * aspectRatio);
        }

        return { width, height, area: width * height };
    }

    private applyGridStyles(gridElement: HTMLElement, layout: { width: number; height: number; cols: number; rows: number }): void {
        const styles = {
            '--tile-width': `${layout.width}px`,
            '--tile-height': `${layout.height}px`,
            '--grid-cols': layout.cols.toString(),
            '--grid-rows': layout.rows.toString(),
            '--grid-gap': `${VideoGroupComponent.DEFAULT_GAP}px`,
        };

        Object.entries(styles).forEach(([property, value]) => {
            gridElement.style.setProperty(property, value);
        });
    }

    private applyPinnedVerticalLayout(): void {
        const container = this.getCachedElement('.pinned-vertical-bottom');
        if (!container || this.getStageParticipants().length === 0) return;

        const dimensions = this.getContainerDimensions(container);
        if (!dimensions) {
            return;
        }

        const { tileWidth, tileHeight } = this.calculatePinnedVerticalDimensions(dimensions);
        this.applyPinnedVerticalStyles(container, tileWidth, tileHeight);
    }

    private calculatePinnedVerticalDimensions(dimensions: { width: number; height: number }): { tileWidth: number; tileHeight: number } {
        const headerHeight = 40;
        const availableWidth = dimensions.width - VideoGroupComponent.DEFAULT_PADDING;
        const availableHeight = dimensions.height - headerHeight - VideoGroupComponent.DEFAULT_PADDING;

        let tileHeight = availableHeight;
        let tileWidth = Math.floor(tileHeight * VideoGroupComponent.ASPECT_RATIO);

        const maxTileWidth = Math.floor(availableWidth / this.getStageParticipants().length) - VideoGroupComponent.DEFAULT_GAP;
        if (tileWidth > maxTileWidth) {
            tileWidth = maxTileWidth;
            tileHeight = Math.floor(tileWidth / VideoGroupComponent.ASPECT_RATIO);
        }

        return {
            tileWidth: Math.max(tileWidth, VideoGroupComponent.MIN_TILE_SIZE),
            tileHeight: Math.max(tileHeight, Math.floor(VideoGroupComponent.MIN_TILE_SIZE / VideoGroupComponent.ASPECT_RATIO))
        };
    }

    private applyPinnedVerticalStyles(container: HTMLElement, tileWidth: number, tileHeight: number): void {
        const styles = {
            '--bottom-tile-width': `${tileWidth}px`,
            '--bottom-tile-height': `${tileHeight}px`,
            '--bottom-gap': `${VideoGroupComponent.DEFAULT_GAP}px`,
        };

        Object.entries(styles).forEach(([property, value]) => {
            container.style.setProperty(property, value);
        });
    }

    private applyPinnedHorizontalLayout(): void {
        const container = this.getCachedElement('.pinned-horizontal-sidebar');
        if (!container || this.getStageParticipants().length === 0) return;

        const dimensions = this.getContainerDimensions(container);
        if (!dimensions) {
            return;
        }

        const { tileWidth, tileHeight } = this.calculatePinnedHorizontalDimensions(dimensions);
        this.applyPinnedHorizontalStyles(container, tileWidth, tileHeight);
    }

    private calculatePinnedHorizontalDimensions(dimensions: { width: number; height: number }): { tileWidth: number; tileHeight: number } {
        const headerHeight = 50;
        const availableWidth = dimensions.width - VideoGroupComponent.DEFAULT_PADDING;
        const availableHeight = dimensions.height - headerHeight - VideoGroupComponent.DEFAULT_PADDING;

        let tileWidth = availableWidth;
        let tileHeight = Math.floor(tileWidth / VideoGroupComponent.ASPECT_RATIO);

        const maxTileHeight = Math.floor(availableHeight / this.getStageParticipants().length) - VideoGroupComponent.DEFAULT_GAP;
        if (tileHeight > maxTileHeight) {
            tileHeight = maxTileHeight;
            tileWidth = Math.floor(tileHeight * VideoGroupComponent.ASPECT_RATIO);
        }

        return {
            tileWidth: Math.max(tileWidth, 100),
            tileHeight: 200 // Fixed height for better visibility as per original code
        };
    }

    private applyPinnedHorizontalStyles(container: HTMLElement, tileWidth: number, tileHeight: number): void {
        const styles = {
            '--sidebar-tile-width': `${tileWidth}px`,
            '--sidebar-tile-height': `${tileHeight}px`,
            '--sidebar-gap': `${VideoGroupComponent.DEFAULT_GAP}px`,
        };

        Object.entries(styles).forEach(([property, value]) => {
            container.style.setProperty(property, value);
        });
    }
}