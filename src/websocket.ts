import {
    MessageType,
    WSMessage,
    ProgressInfo,
    PLUGIN_NAME,
    WS_CONFIG,
    LyricData,
    SongInfo
} from './const';

export class SocketManager {
    private socket: any = null;
    private messageQueue: string[] = [];
    private isDisposed = false;

    constructor(private port: number) {
        this.connect();
    }

    get isConnected(): boolean {
        return this.socket !== null;
    }

    updatePort(newPort: number) {
        this.port = newPort;
        this.disconnect();
        this.connect();
    }

    private connect() {
        if (this.isDisposed) return;

        try {
            // 使用 TCP Socket
            this.socket = betterncm.app.createTCPClient("127.0.0.1", this.port);
            console.log(`[${PLUGIN_NAME}] 已连接到端口 ${this.port}`);
            this.flushMessageQueue();
        } catch (error) {
            console.error(`[${PLUGIN_NAME}] 连接失败:`, error);
            // 3秒后重试
            setTimeout(() => this.connect(), 3000);
        }
    }

    private disconnect() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (error) {
                console.error(`[${PLUGIN_NAME}] 关闭连接失败:`, error);
            }
            this.socket = null;
        }
    }

    private flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            if (message) {
                this.socket.write(message + '\n');  // 添加换行符作为消息分隔符
            }
        }
    }

    private send<T>(type: MessageType, data: T) {
        const message: WSMessage<T> = {
            type,
            timestamp: Date.now(),
            data
        };

        const json = JSON.stringify(message);
        if (this.isConnected) {
            this.socket.write(json + '\n');  // 添加换行符作为消息分隔符
        } else {
            this.messageQueue.push(json);
            if (this.messageQueue.length > WS_CONFIG.MAX_QUEUE_SIZE) {
                this.messageQueue.shift();
            }
        }
    }

    // 发送歌曲信息
    sendSongChange(data: SongInfo) {
        this.send(MessageType.SONG_CHANGE, data);
    }

    // 发送播放进度
    sendProgress(data: ProgressInfo) {
        this.send(MessageType.PROGRESS, data);
    }

    // 发送错误信息
    sendError(error: string) {
        this.send(MessageType.ERROR, { message: error });
    }

    // 发送实时歌词
    sendLyric(data: LyricData) {
        this.send(MessageType.LYRIC, data);
    }

    dispose() {
        this.isDisposed = true;
        this.messageQueue = [];
        this.disconnect();
    }
} 

