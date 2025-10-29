import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from "@angular/core";
import { Subscription } from "rxjs/internal/Subscription";

@Component({
    selector: 'app-audio-track',
    templateUrl: './audio-track.component.html'
})

export class AudioTrackComponent implements OnInit, OnDestroy, OnChanges {

    @Input() joined: boolean;
    @Input() audioReady: boolean;
    @Input() local: boolean;
    @Input() audioTrack: MediaStreamTrack | undefined;
    @Input() role: 'backstage' | 'stage';

    audioStream: MediaStream | undefined;

    // If there's a video/audio/screen track on init, create a MediaStream for it.
    ngOnInit(): void {
        if (this.audioTrack) {
            this.addAudioStream(this.audioTrack);
        }
    }

    /**
     * Changes that require updates include:
     * - Creating a video/audio/screen stream for the first time
     * - Replacing the video/audio/screen *track* for an existing stream
     */
    ngOnChanges(changes: SimpleChanges): void {
        const { audioTrack } = changes;

        // Handle audio track changes
        if (audioTrack?.currentValue && !this.audioStream) {
            this.addAudioStream(audioTrack.currentValue);
        }
        if (audioTrack?.currentValue && this.audioStream) {
            this.updateAudioTrack(audioTrack.previousValue, audioTrack.currentValue);
        }
    }

    addAudioStream(track: MediaStreamTrack) {
        this.audioStream = new MediaStream([track]);
    }

    updateAudioTrack(oldTrack: MediaStreamTrack, track: MediaStreamTrack) {
        if (oldTrack) {
            this.audioStream?.removeTrack(oldTrack);
        }
        this.audioStream?.addTrack(track);
    }

    ngOnDestroy(): void {

    }
}