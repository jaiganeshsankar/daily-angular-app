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
  private subscriptions: Subscription[] = [];

  constructor(private liveStreamService: LiveStreamService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.liveStreamService.liveState$.subscribe(isLive => {
        this.isLive = isLive;
      }),
      this.liveStreamService.joinedState$.subscribe(isJoined => {
        this.isJoined = isJoined;
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
}
