// Complete rewrite of VoiceRecognitionService to ensure proper functionality

import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class VoiceRecognitionService {
    private recognition: any;
    private isListeningSubject = new BehaviorSubject<boolean>(false);
    public isListening$ = this.isListeningSubject.asObservable();
    private transcriptSubject = new BehaviorSubject<string>('');
    public transcript$ = this.transcriptSubject.asObservable();
    private audioBlob: Blob | null = null;
    private mediaRecorder: any;
    private audioChunks: BlobPart[] = [];
    private isBrowser: boolean;
    private stream: MediaStream | null = null;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        console.log('VoiceRecognitionService initialized, browser environment:', this.isBrowser);

        // Only initialize recognition in browser environment
        if (this.isBrowser) {
            this.initRecognition();
        }
    }

    private initRecognition(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        // Check if browser supports SpeechRecognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            return;
        }

        console.log('Speech recognition is supported!');

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.isListeningSubject.next(true);
        };

        this.recognition.onresult = (event: any) => {
            console.log('Speech recognition result received', event);
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript;
            console.log('Transcript:', transcript);

            if (event.results[current].isFinal) {
                console.log('Final result:', transcript);
                this.transcriptSubject.next(transcript);
            }
        };

        this.recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event);
            this.isListeningSubject.next(false);
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            this.isListeningSubject.next(false);
        };
    }

    public async start(): Promise<void> {
        console.log('Starting voice recognition...');

        // Skip if not in browser environment
        if (!this.isBrowser) {
            console.warn('Not in browser environment, cannot start voice recognition');
            return;
        }

        // Clear previous state
        this.transcriptSubject.next('');
        this.audioChunks = [];
        this.audioBlob = null;

        // IMMEDIATELY emit the listening state for UI feedback
        this.isListeningSubject.next(true);

        try {
            // Request microphone permission
            console.log('Requesting microphone permission...');
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone permission granted!', this.stream);

            // Start recording and recognition
            this.startAudioRecording(this.stream);

            if (this.recognition) {
                try {
                    console.log('Starting speech recognition...');
                    this.recognition.start();
                } catch (e) {
                    console.error('Error starting speech recognition:', e);
                    // If recognition fails to start (e.g., already started), recreate it
                    this.initRecognition();
                    setTimeout(() => {
                        console.log('Retrying speech recognition...');
                        this.recognition.start();
                    }, 100);
                }
            } else {
                console.error('Speech recognition not initialized');
                this.initRecognition();
                if (this.recognition) {
                    console.log('Initialized recognition, starting...');
                    this.recognition.start();
                }
            }
        } catch (err) {
            console.error('Error starting voice recognition:', err);
            // If there's an error, make sure to reset the listening state
            this.isListeningSubject.next(false);
        }
    }
    public stop(): void {
        console.log('Stopping voice recognition...');

        // Skip if not in browser environment
        if (!this.isBrowser) return;

        try {
            if (this.recognition) {
                this.recognition.stop();
            }
        } catch (e) {
            console.error('Error stopping recognition:', e);
        }

        this.stopAudioRecording();
        this.isListeningSubject.next(false);

        // Stop and release the media stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    private startAudioRecording(stream: MediaStream): void {
        console.log('Starting audio recording...');

        try {
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.addEventListener('dataavailable', (event: any) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            });

            this.mediaRecorder.addEventListener('stop', () => {
                console.log('Audio recording stopped, creating blob...');
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                console.log('Audio blob created:', this.audioBlob);
            });

            this.mediaRecorder.start();
            console.log('Audio recording started!');
        } catch (err) {
            console.error('Error starting audio recording:', err);
        }
    }

    private stopAudioRecording(): void {
        console.log('Stopping audio recording...');

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.error('Error stopping media recorder:', e);
            }
        }
    }

    public getAudioBlob(): Blob | null {
        return this.audioBlob;
    }

    public clearTranscript(): void {
        this.transcriptSubject.next('');
    }
}