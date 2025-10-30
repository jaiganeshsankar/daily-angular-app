import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from "@angular/core";
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

    // NEW: Audio control properties for backstage users
    stagePlaybackVolume: number = 1;
    isBackstageMuted: boolean = false;

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

        // Subscribe to toggle stream events
        this.toggleStreamSubscription = this.liveStreamService.toggleStream$.subscribe(() => {
            console.log('🎬 VideoGroupComponent: Received toggle stream event');
            this.toggleLiveStream();
        });

        try {
            this.layouts = [VideoLayout.TILED,
            VideoLayout.PINNED_VERTICAL, VideoLayout.PINNED_HORIZONTAL, VideoLayout.FULL_SCREEN];
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
                .on("app-message", this.handleAppMessage)
                .on("live-streaming-started", this.handleLiveStreamingStarted)
                .on("live-streaming-stopped", this.handleLiveStreamingStopped)
                .on("live-streaming-error", this.handleLiveStreamingError);

            await this.callObject.join({
                userName: this.userName,
                url: this.dailyRoomUrl,
                token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyIjoiQmk0dEFPWTJGRUs1Z2k1bllLbWUiLCJvIjp0cnVlLCJzcyI6dHJ1ZSwiZCI6Ijg3YmEzM2JiLWQ3YjAtNDA5OC1iMGVmLWNkYWFjMDg1MTc2MCIsImlhdCI6MTc2MTY2ODI3MX0.caecSEIZwos2YZV0NbHI2NoeN-IVCgdbAuju2bWTmKg'
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
        if (this.toggleStreamSubscription) {
            this.toggleStreamSubscription.unsubscribe();
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
            .off("app-message", this.handleAppMessage)
            .off("live-streaming-started", this.handleLiveStreamingStarted)
            .off("live-streaming-stopped", this.handleLiveStreamingStopped)
            .off("live-streaming-error", this.handleLiveStreamingError);
    }

    handleAppMessage = (e: any): void => {
        if (!e || !e.data || !e.data.type) return;

        if (e.data.type === 'ROLE_REQUEST' && e.data.newRole) {
            console.log(`Received role change request from ${e.fromId}: ${e.data.newRole}`);
            this.callObject?.setUserData({ role: e.data.newRole });
            this.reCalculateLayoutData();
        }

        // NEW: Handle layout change messages
        if (e.data.type === 'LAYOUT_CHANGE' && e.data.layout) {
            console.log(`Received layout change from ${e.fromId}: ${e.data.layout}`);
            this.selectedLayout = e.data.layout;
            this.reCalculateLayoutData();
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
        this.participants[participant.session_id] = p;
        this.participantRoles[participant.session_id] = p.role;
        this.updateAudioSubscriptions();

        // NEW: Apply volume controls to new remote participants
        if (!p.local) {
            // Delay volume application to allow audio elements to be created
            setTimeout(() => {
                if (p.role === 'stage') {
                    this.setParticipantAudioVolume(p.id, this.stagePlaybackVolume);
                } else if (p.role === 'backstage') {
                    this.setParticipantAudioVolume(p.id, this.isBackstageMuted ? 0 : 1);
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

    handleParticipantUpdated = async (e: DailyEventObjectParticipant | undefined) => {
        if (!e) return;
        console.log('Participant updated:', e.participant.user_name, e.participant.userData);
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

            // AND if the role changed TO backstage FROM stage
            if (updatedP.role === 'backstage' && previousRole === 'stage') {
                // AND if we are currently sharing screen
                if (this.isScreenSharing) {
                    try {
                        console.log('Stopping local screen share because local role changed to backstage.');
                        await this.callObject?.stopScreenShare();
                        this.updateScreenSharingParticipant();
                    } catch (stopError) {
                        console.error('Error stopping local screen share on role change:', stopError);
                    }
                }
            }
        }

        // Update live stream if currently streaming
        if (this.isLive) {
            console.log('🔄 Live stream is active - updating participants due to role change...');
            try {
                const newLayoutOptions = this.getStreamingLayoutOptions();
                console.log('🔄 Updating live stream with new layout:', newLayoutOptions);
                
                if (this.callObject) {
                    await this.callObject.updateLiveStreaming({ 
                        layout: newLayoutOptions 
                    });
                    console.log('✅ Live stream updated successfully');
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
                    this.setParticipantAudioVolume(participant.session_id, this.stagePlaybackVolume);
                } else if (updatedP.role === 'backstage') {
                    this.setParticipantAudioVolume(participant.session_id, this.isBackstageMuted ? 0 : 1);
                }
            }, 100);
        }

        this.updateAudioSubscriptions();
        console.log('Recalculating layout due to participant update', this.getStageParticipants().length);
        if (this.getStageParticipants().length > 0) {
            this.reCalculateLayoutData();
        }
    };

    handleTrackStartedStopped = (e: DailyEventObjectTrack | undefined): void => {
        console.log("track started or stopped");
        if (!e || !e.participant || !this.joined) return;
        this.updateTrack(e.participant, e.type);

        if (e.type === "screenVideo") {
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

    // NEW: Audio control methods for backstage users
    handleStageVolumeChange(event: any): void {
        this.stagePlaybackVolume = parseFloat(event.target.value);
        this.updateStageVolumes();
    }

    updateStageVolumes(): void {
        Object.values(this.participants).forEach(participant => {
            if (participant.role === 'stage' && !participant.local) {
                this.setParticipantAudioVolume(participant.id, this.stagePlaybackVolume);
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
        
        console.log(`Updating ${backstageParticipants.length} backstage participants to volume ${newVolume}`);
        console.log('Backstage participants:', backstageParticipants.map(p => ({ id: p.id, userName: p.userName, role: p.role })));
        
        backstageParticipants.forEach(participant => {
            this.setParticipantAudioVolume(participant.id, newVolume);
        });
    }

    private setParticipantAudioVolume(participantId: string, volume: number): void {
        try {
            let audioElementsFound = 0;
            const participant = this.participants[participantId];
            
            console.log(`Setting volume ${volume} for participant ${participantId} (${participant?.role})`);

            // Method 1: Find audio elements by data-participant-id attribute
            const audioElements = document.querySelectorAll(`audio[data-participant-id="${participantId}"]`);
            audioElements.forEach((audioElement: any) => {
                if (audioElement && typeof audioElement.volume !== 'undefined') {
                    audioElement.volume = Math.max(0, Math.min(1, volume));
                    audioElementsFound++;
                    console.log(`Set volume via data-participant-id for ${participantId}`);
                }
            });

            // Method 2: Find by participant session ID in various selectors
            const participantElements = document.querySelectorAll(`[data-peer-id="${participantId}"]`);
            participantElements.forEach(element => {
                const audioEl = element.querySelector('audio');
                if (audioEl && typeof audioEl.volume !== 'undefined') {
                    audioEl.volume = Math.max(0, Math.min(1, volume));
                    audioElementsFound++;
                    console.log(`Set volume via data-peer-id for ${participantId}`);
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
                        console.log(`Set volume via audio track match for ${participantId}`);
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
                    console.log(`Set volume via video-tile for ${participantId}`);
                }
            });

            if (audioElementsFound === 0) {
                console.warn(`No audio elements found for participant ${participantId} (${participant?.role})`);
                // Log available elements for debugging
                console.log('Available audio elements:', document.querySelectorAll('audio').length);
                console.log('Available peer elements:', document.querySelectorAll('[data-peer-id]').length);
            } else {
                console.log(`Successfully set volume for ${audioElementsFound} audio elements for participant ${participantId}`);
            }
        } catch (error) {
            console.error('Error setting audio volume for participant:', participantId, error);
        }
    }

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
                // Start live stream - don't set state here, let the event handler do it
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
                layout: layoutOptions
            };
            
            console.log('🎥 Live streaming config:', streamingConfig);
            console.log('🚀 Calling startLiveStreaming...');
            
            const result = await this.callObject.startLiveStreaming(streamingConfig);
            console.log('✅ Live streaming start result:', result);
            
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
                participants: { video: [], audio: [] },
                composition_params: { 
                    'background-color': '#000000' 
                }
            };
        }

        // Handle non-empty stage scenario with VCS baseline composition
        console.log('🎭 Stage participants found, using VCS baseline composition for layout:', this.selectedLayout);
        
        // Base layout with participants filter
        const layout: any = {
            preset: 'custom' as const,
            participants: {
                video: stageParticipantIds,
                audio: stageParticipantIds
            },
            composition_params: {}
        };

        // Set VCS baseline composition parameters based on selectedLayout
        switch (this.selectedLayout) {
            case VideoLayout.TILED:
                // Grid layout - no screen share (UI enforces this)
                layout.composition_params = {
                    mode: 'grid',
                    'videoSettings.showParticipantLabels': false
                };
                break;
                
            case VideoLayout.PINNED_VERTICAL:
                // Screen share with thumbnails at bottom (UI enforces screen share exists)
                layout.composition_params = {
                    mode: 'dominant',
                    'videoSettings.preferScreenshare': true,
                    'videoSettings.dominant.position': 'top',
                    'videoSettings.dominant.splitPos': 0.7,
                    'videoSettings.dominant.numChiclets': Math.min(5, stageParticipantIds.length),
                    'videoSettings.dominant.followDomFlag': false,
                    'videoSettings.dominant.itemInterval_gu': 0.2,
                    'videoSettings.dominant.outerPadding_gu': 0.2,
                    'videoSettings.dominant.splitMargin_gu': 0,
                    'videoSettings.maxCamStreams': stageParticipantIds.length,
                    'videoSettings.scaleMode': 'fit',
                    'videoSettings.showParticipantLabels': false
                };
                break;
                
            case VideoLayout.PINNED_HORIZONTAL:
                // Screen share with thumbnails on right (UI enforces screen share exists)
                layout.composition_params = {
                    mode: 'dominant',
                    'videoSettings.preferScreenshare': true,
                    'videoSettings.dominant.position': 'left',
                    'videoSettings.dominant.splitPos': 0.75,
                    'videoSettings.dominant.numChiclets': Math.min(5, stageParticipantIds.length),
                    'videoSettings.dominant.followDomFlag': false,
                    'videoSettings.dominant.itemInterval_gu': 0.2,
                    'videoSettings.dominant.outerPadding_gu': 0.2,
                    'videoSettings.dominant.splitMargin_gu': 0,
                    'videoSettings.maxCamStreams': stageParticipantIds.length,
                    'videoSettings.scaleMode': 'fit',
                    'videoSettings.showParticipantLabels': false
                };
                break;
                
            case VideoLayout.FULL_SCREEN:
                // Only screen share, no participants (UI enforces screen share exists)
                layout.composition_params = {
                    mode: 'single',
                    'videoSettings.preferScreenshare': true,
                    'videoSettings.maxCamStreams': 1,
                    'videoSettings.omitAudioOnly': true
                };
                // Ensure we get the screen share
                if (this.screenSharingParticipant) {
                    layout.composition_params['videoSettings.preferredParticipantIds'] = this.screenSharingParticipant.id;
                }
                break;
                
            default:
                layout.composition_params = {
                    mode: 'grid',
                    'videoSettings.showParticipantLabels': false
                };
        }

        console.log('🎥 Final VCS layout config:', {
            preset: layout.preset,
            mode: layout.composition_params.mode,
            participantCount: stageParticipantIds.length,
            screenSharing: !!this.screenSharingParticipant
        });
        
        return layout;
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

    updateScreenSharingParticipant(): void {
        let applyScreenshareLayout = false;
        const previousScreenSharingParticipant = this.screenSharingParticipant;
        
        if (this.screenSharingParticipant === null) {
            applyScreenshareLayout = true;
        }
        const sharingParticipant = Object.values(this.participants).find(p => p.screenVideoReady);
        this.screenSharingParticipant = sharingParticipant || null;
        
        // Update live stream if currently streaming and screen sharing status changed
        if (this.isLive && previousScreenSharingParticipant !== this.screenSharingParticipant) {
            console.log('🔄 Live stream is active - updating due to screen sharing change...');
            try {
                const newLayoutOptions = this.getStreamingLayoutOptions();
                console.log('🔄 Updating live stream with new screen sharing layout:', newLayoutOptions);
                
                // Update live streaming layout asynchronously
                (async () => {
                    try {
                        await this.callObject!.updateLiveStreaming({ 
                            layout: newLayoutOptions 
                        });
                        console.log('✅ Live stream updated for screen sharing change');
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

    changeLayout(layout: VideoLayout): void {
        if (!this.callObject || !this.joined) return;
        if (this.isLayoutDisabled(layout)) {
            console.warn('Cannot switch to this layout due to screen share status.');
            return;
        }
        this.selectedLayout = layout;
        this.showLayoutMenu = false;

        // Update live stream layout if currently streaming
        if (this.isLive) {
            console.log('🔄 Live stream is active - updating layout due to user selection...');
            try {
                const newLayoutOptions = this.getStreamingLayoutOptions();
                console.log('🔄 Updating live stream with new layout:', newLayoutOptions);
                
                // Update live streaming layout asynchronously
                (async () => {
                    try {
                        await this.callObject!.updateLiveStreaming({ 
                            layout: newLayoutOptions 
                        });
                        console.log('✅ Live stream layout updated successfully');
                    } catch (updateError: any) {
                        console.error('❌ Failed to update live stream layout:', updateError);
                        this.error = 'Failed to update live stream layout. Please try again.';
                        setTimeout(() => { this.error = ''; }, 5000);
                    }
                })();
            } catch (error) {
                console.error('❌ Error preparing layout update:', error);
                this.error = 'Failed to update live stream layout. Please try again.';
                setTimeout(() => { this.error = ''; }, 5000);
            }
        }

        console.log('Layout changed to:', layout);
        this.reCalculateLayoutData();
    }

    isLayoutDisabled(layout: VideoLayout): boolean {
        // When screen sharing is inactive, layouts 2,3,4 should be disabled
        if (!this.isScreenSharing && (layout === VideoLayout.PINNED_VERTICAL || layout === VideoLayout.PINNED_HORIZONTAL || layout === VideoLayout.FULL_SCREEN)) {
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

    private getContainerDimensions(element: HTMLElement): { width: number; height: number } | null {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    }

    private getCachedElement(selector: string): HTMLElement | null {
        const element = document.querySelector(selector) as HTMLElement;
        return element || null;
    }

    reCalculateLayoutData = (): void => {
        if (this.selectedLayout === VideoLayout.TILED) {
            this.applyTiledLayout();
        } else if (this.selectedLayout === VideoLayout.PINNED_VERTICAL) {
            this.applyPinnedHorizontalLayout()
        } else if (this.selectedLayout === VideoLayout.PINNED_HORIZONTAL) {
            this.applyPinnedVerticalLayout()
        }
    };

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