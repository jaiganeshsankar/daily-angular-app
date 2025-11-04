import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, Renderer2, SimpleChanges } from "@angular/core";


@Component({
	selector: 'app-hv-mainstage-screen-share',
	templateUrl: './mainstage-screenshare.component.html',
	styleUrls: ['./mainstage-screenshare.component.scss']

})

export class MainstageScreenShareTileComponent implements OnInit, OnDestroy {

	@Input() screenVideoReady: boolean;
	@Input() screenAudioReady: boolean;
	@Input() screenVideoTrack: MediaStreamTrack | undefined;
	@Input() screenAudioTrack: MediaStreamTrack | undefined;
	@Input() screenShareView: boolean = false;
	@Input() local: boolean;
	@Input() userName: string;
	@Input() screenSharingParticipant: any = null; // **NEW INPUT**
	@Input() role: 'backstage' | 'stage';

	screenVideoStream: MediaStream | undefined;
	screenAudioStream: MediaStream | undefined;
	playbackVolume: number = 1; // Default volume for screenshare audio

	constructor(
		private readonly elementRef: ElementRef,
		private readonly renderer: Renderer2) { }

	ngOnInit() {
		if (this.screenVideoTrack) {
			this.addScreenVideoStream(this.screenVideoTrack);
		}
		if (this.screenAudioTrack) {
			this.addScreenAudioStream(this.screenAudioTrack);
		}
	}

	addScreenVideoStream(track: MediaStreamTrack) {
		this.screenVideoStream = new MediaStream([track]);
	}

	addScreenAudioStream(track: MediaStreamTrack) {
		this.screenAudioStream = new MediaStream([track]);
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

	ngOnChanges(changes: SimpleChanges): void {
		const { screenVideoTrack, screenAudioTrack } = changes;

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

	ngAfterViewInit(): void {

	}

	@HostListener('window:resize', ['$event'])
	onResize(event: Event) {
		// this.applyLayout();
	}

	applyLayout = () => {
		const videoEle = this.elementRef.nativeElement.querySelector('video');
		const aspectRatio = 16 / 9;
		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;
		let calculatedWidth = windowWidth;
		let calculatedHeight = windowWidth / aspectRatio;

		if (calculatedHeight > windowHeight) {
			calculatedHeight = windowHeight;
			calculatedWidth = windowHeight * aspectRatio;
		}

		this.renderer.setStyle(videoEle, 'width', calculatedWidth + 'px');
		this.renderer.setStyle(videoEle, 'height', calculatedHeight + 'px');
	}

	ngOnDestroy(): void {

	}
}