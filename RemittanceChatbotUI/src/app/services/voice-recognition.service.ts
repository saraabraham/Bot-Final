import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    [index: number]: SpeechRecognitionResult;
    length: number;
}

interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative;
    length: number;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

@Injectable({
    providedIn: 'root'
})
export class VoiceRecognitionService {
    private recognition: any;
    private isListening = new BehaviorSubject<boolean>(false);
    public isListening$ = this.isListening.asObservable();
    private transcript = new BehaviorSubject<string>('');
    public transcript$ = this.transcript.asObservable();
    private audioBlob: Blob | null = null;
    private mediaRecorder: any;
    private audioChunks: BlobPart[] = [];
    private isBrowser: boolean;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        // Only initialize recognition in browser environment
        if (this.isBrowser) {
            this.initRecognition();
        }
    }

    private initRecognition(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        // Check if browser supports SpeechRecognition
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            const current = event.resultIndex;
            const currentTranscript = event.results[current][0].transcript;

            if (event.results[current].isFinal) {
                this.transcript.next(currentTranscript);
            }
        };

        this.recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event);
            this.stop();
        };

        this.recognition.onend = () => {
            this.isListening.next(false);
        };
    }

    start(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (!this.recognition) {
            this.initRecognition();
            if (!this.recognition) return;
        }

        this.transcript.next('');
        this.audioChunks = [];
        this.recognition.start();
        this.isListening.next(true);

        // Set up audio recording for STT API
        this.startAudioRecording();
    }

    stop(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (this.recognition) {
            this.recognition.stop();
            this.isListening.next(false);
            this.stopAudioRecording();
        }
    }

    private startAudioRecording(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        // Set up MediaRecorder for capturing audio for backend STT processing
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.mediaRecorder = new MediaRecorder(stream);

                this.mediaRecorder.addEventListener('dataavailable', (event: any) => {
                    this.audioChunks.push(event.data);
                });

                this.mediaRecorder.addEventListener('stop', () => {
                    this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    // Release media stream tracks
                    stream.getTracks().forEach(track => track.stop());
                });

                this.mediaRecorder.start();
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
            });
    }

    private stopAudioRecording(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    getAudioBlob(): Blob | null {
        return this.audioBlob;
    }

    clearTranscript(): void {
        this.transcript.next('');
    }
}