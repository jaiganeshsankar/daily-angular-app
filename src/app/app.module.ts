import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { ReactiveFormsModule } from "@angular/forms";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { JoinFormComponent } from "./join-form/join-form.component";
import { DailyContainerComponent } from "./daily-container/daily-container.component";
import { VideoTileComponent } from "./video-tile/video-tile.component";
import { CallComponent } from "./call/call.component";
import { ChatComponent } from "./chat/chat.component";
import { ErrorMessageComponent } from "./error-message/error-message.component";
import { VideoGroupComponent } from "./video-group/video-group.component";
import { MainstageScreenShareTileComponent } from "./screenshare/mainstage-screenshare.component";
import { MainstageSpeakerTileComponent } from "./mainstage-speaker-tile/mainstage-speaker-tile.component";
import { AudioTrackComponent } from "./audio-track/audio-track.component";

@NgModule({
  declarations: [
    AppComponent,
    JoinFormComponent,
    DailyContainerComponent,
    VideoTileComponent,
    CallComponent,
    ChatComponent,
    ErrorMessageComponent,
    VideoGroupComponent,
    MainstageScreenShareTileComponent,
    MainstageSpeakerTileComponent,
    AudioTrackComponent
  ],
  imports: [BrowserModule, AppRoutingModule, ReactiveFormsModule],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }
