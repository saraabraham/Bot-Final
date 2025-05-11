import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { VoiceRecognitionService } from '../../services/voice-recognition.service';
import { ChatService } from '../../services/chat.service';

@Component({
    selector: 'app-voice-input',
    templateUrl: './voice-input.component.html',
    styleUrls: ['./voice-input.component.scss']
})
export class VoiceInputComponent implements OnInit, OnDestroy {
    @Output() resultProcessed = new EventEmitter<void>();

    isListening = false;
    transcript = '';
    microphoneSupported = true;
    errorMessage = '';
    processingAudio = false;

    private destroy$ = new Subject<void>();

    constructor(
        private voiceService: VoiceRecognitionService,
        private chatService: ChatService
    ) { }

    ngOnInit(): void {
        // Check if browser supports speech recognition
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.microphoneSupported = false;
            this.errorMessage = 'Your browser does not support voice recognition. Try using Chrome or Edge.';
        }

        // Subscribe to voice recognition status
        this.voiceService.isListening$
            .pipe(takeUntil(this.destroy$))
            .subscribe(isListening => {
                this.isListening = isListening;

                // When we stop listening but have a transcript, process it
                if (!isListening && this.transcript && !this.processingAudio) {
                    this.processVoiceInput();
                }
            });

        // Subscribe to voice transcripts
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                this.transcript = transcript;
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    toggleVoiceRecognition(): void {
        if (!this.microphoneSupported) {
            return;
        }

        if (this.isListening) {
            this.voiceService.stop();
        } else {
            this.errorMessage = '';
            this.transcript = '';
            this.voiceService.start();
        }
    }

    processVoiceInput(): void {
        if (!this.transcript) {
            return;
        }

        const audioBlob = this.voiceService.getAudioBlob();
        if (audioBlob) {
            this.processingAudio = true;

            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command) => {
                    console.log('Voice command processed:', command);
                    this.processingAudio = false;
                    this.resultProcessed.emit();
                },
                error: (error) => {
                    console.error('Error processing voice command:', error);
                    this.errorMessage = 'Failed to process voice input. Please try again.';
                    this.processingAudio = false;
                }
            });
        } else {
            // If we have transcript but no blob (rare edge case)
            this.chatService.sendMessage(this.transcript).subscribe({
                next: () => {
                    this.resultProcessed.emit();
                },
                error: (error) => {
                    console.error('Error sending voice transcript:', error);
                    this.errorMessage = 'Failed to send voice message. Please try again.';
                }
            });
        }

        // Clear the transcript after processing
        this.voiceService.clearTranscript();
        this.transcript = '';
    }

    cancelVoiceInput(): void {
        if (this.isListening) {
            this.voiceService.stop();
        }
        this.transcript = '';
        this.voiceService.clearTranscript();
        this.resultProcessed.emit();
    }
}