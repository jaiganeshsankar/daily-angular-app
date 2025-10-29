import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LiveStreamService {
  private liveStateSubject = new BehaviorSubject<boolean>(false);
  private joinedStateSubject = new BehaviorSubject<boolean>(false);
  private toggleStreamSubject = new Subject<void>();

  liveState$ = this.liveStateSubject.asObservable();
  joinedState$ = this.joinedStateSubject.asObservable();
  toggleStream$ = this.toggleStreamSubject.asObservable();

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
}