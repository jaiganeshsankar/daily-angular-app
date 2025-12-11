import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LiveStreamService {
  private liveStateSubject = new BehaviorSubject<boolean>(false);
  private joinedStateSubject = new BehaviorSubject<boolean>(false);
  private toggleStreamSubject = new Subject<void>();
  private textOverlaySubject = new BehaviorSubject<boolean>(false);
  private imageOverlaySubject = new BehaviorSubject<boolean>(false);
  private toggleOverlaySubject = new Subject<{ type: 'text' | 'image' }>();
  private recordingEnabledSubject = new BehaviorSubject<boolean>(false); // Default: recording disabled for safety
  private toggleRecordingSubject = new Subject<void>();

  liveState$ = this.liveStateSubject.asObservable();
  joinedState$ = this.joinedStateSubject.asObservable();
  toggleStream$ = this.toggleStreamSubject.asObservable();
  textOverlayState$ = this.textOverlaySubject.asObservable();
  imageOverlayState$ = this.imageOverlaySubject.asObservable();
  toggleOverlay$ = this.toggleOverlaySubject.asObservable();
  recordingEnabledState$ = this.recordingEnabledSubject.asObservable();
  toggleRecording$ = this.toggleRecordingSubject.asObservable();

  setLiveState(isLive: boolean): void {
    this.liveStateSubject.next(isLive);
  }

  setJoinedState(isJoined: boolean): void {
    this.joinedStateSubject.next(isJoined);
  }

  toggleLiveStream(): void {
    console.log('🎬 LiveStreamService: toggleLiveStream called');
    this.toggleStreamSubject.next();
  }

  get isLive(): boolean {
    return this.liveStateSubject.value;
  }

  get isJoined(): boolean {
    return this.joinedStateSubject.value;
  }

  setTextOverlayState(visible: boolean): void {
    this.textOverlaySubject.next(visible);
  }

  setImageOverlayState(visible: boolean): void {
    this.imageOverlaySubject.next(visible);
  }

  toggleOverlay(type: 'text' | 'image'): void {
    console.log(`🎨 LiveStreamService: toggleOverlay called for ${type}`);
    this.toggleOverlaySubject.next({ type });
  }

  get showTextOverlay(): boolean {
    return this.textOverlaySubject.value;
  }

  get showImageOverlay(): boolean {
    return this.imageOverlaySubject.value;
  }

  setRecordingEnabled(enabled: boolean): void {
    const previousState = this.recordingEnabledSubject.value;
    if (previousState !== enabled) {
      console.log('🎥 LiveStreamService: Recording state changing from', previousState, 'to', enabled);
    }
    this.recordingEnabledSubject.next(enabled);
  }

  toggleRecording(): void {
    console.log('🎥 LiveStreamService: toggleRecording called');
    console.log('🎥 Current recording state:', this.recordingEnabledSubject.value);
    console.log('🎥 Emitting toggle event to subscribers...');
    this.toggleRecordingSubject.next();
    console.log('🎥 Toggle event emitted');
  }

  get isRecordingEnabled(): boolean {
    return this.recordingEnabledSubject.value;
  }
}