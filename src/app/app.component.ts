import { Component, OnInit, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import { LiveStreamService } from "./services/live-stream.service";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit, OnDestroy {
  title = "daily-custom-angular";
  isLive = false;
  isJoined = false;
  showTextOverlay = false;
  showImageOverlay = false;
  recordingEnabled = true;
  private subscriptions: Subscription[] = [];

  constructor(private liveStreamService: LiveStreamService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.liveStreamService.liveState$.subscribe(isLive => {
        this.isLive = isLive;
      }),
      this.liveStreamService.joinedState$.subscribe(isJoined => {
        this.isJoined = isJoined;
      }),
      this.liveStreamService.textOverlayState$.subscribe(visible => {
        this.showTextOverlay = visible;
      }),
      this.liveStreamService.imageOverlayState$.subscribe(visible => {
        this.showImageOverlay = visible;
      }),
      this.liveStreamService.recordingEnabledState$.subscribe(enabled => {
        console.log('🎥 AppComponent: Recording state changed to:', enabled);
        console.log('🎥 Previous app state:', this.recordingEnabled);
        this.recordingEnabled = enabled;
        console.log('🎥 Updated app state to:', this.recordingEnabled);
        console.log('🎥 App component should now show updated recording button state');
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  toggleLiveStream(): void {
    this.liveStreamService.toggleLiveStream();
    console.log('Live stream toggled:', this.liveStreamService.isLive);
  }

  toggleOverlay(type: 'text' | 'image'): void {
    this.liveStreamService.toggleOverlay(type);
  }

  toggleRecording(): void {
    console.log('🎥 AppComponent: toggleRecording called');
    console.log('🎥 Current app component recording state:', this.recordingEnabled);
    this.liveStreamService.toggleRecording();
    console.log('🎥 Service toggleRecording called from app component');
  }
}
