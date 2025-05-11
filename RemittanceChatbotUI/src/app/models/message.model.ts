export enum MessageSender {
    USER = 'user',
    BOT = 'bot'
}

export interface ChatMessage {
    id: string;
    text: string;
    sender: MessageSender;
    timestamp: Date;
    isProcessing?: boolean;
}

export interface BotCommand {
    intent: string;
    entities: { [key: string]: any };
    confidence: number;
    text?: string;
}