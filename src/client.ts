import { BaseMessage, LyricData, LyricMessage, MessageType, PlayStateMessage, PLUGIN_NAME, ProgressMessage, SongInfo, SongMessage } from "./const";

export class LyricClient {
    private port: number;
    private isConnected = false;
    private readonly reconnectTimeout = 200; // 重连间隔，改为0.2秒喵~
    private checkTimer?: number;  // 改用 number 类型
    private isReconnecting = false;  // 添加重连状态标记
    private lastReconnectTime = 0;   // 记录上次重连时间
    private readonly minReconnectInterval = 1000;  // 最小重连间隔（毫秒）

    constructor(port: number) {
        this.port = port;
        void this.startConnectionCheck();
    }

    private async startConnectionCheck(): Promise<void> {
        // 清理旧的定时器
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }

        // 启动新的定时检查
        this.checkTimer = setInterval(() => {
            if (!this.isConnected) {
                void this.checkConnection();
            }
        }, this.reconnectTimeout);

        // 立即检查一次
        void this.checkConnection();
    }

    private async checkConnection(): Promise<boolean> {
        // 检查是否正在重连
        if (this.isReconnecting) return false;

        // 检查重连间隔
        const now = Date.now();
        if (now - this.lastReconnectTime < this.minReconnectInterval) {
            return false;
        }

        try {
            this.isReconnecting = true;
            this.lastReconnectTime = now;

            const response = await fetch(`http://127.0.0.1:${this.port}/ping`, {
                method: 'GET'
            });

            if (response.ok) {
                if (!this.isConnected) {
                    console.log(`[${PLUGIN_NAME}] 服务器已连接`);
                    this.isConnected = true;
                    // 使用 Promise.resolve().then 来确保异步执行
                    Promise.resolve().then(() => this.onConnectionRestored());
                }
                return true;
            }
        } catch {
            // 只在状态变化时打印一次日志
            if (this.isConnected) {
                console.log(`[${PLUGIN_NAME}] 等待服务器连接...`);
                this.isConnected = false;
            }
        } finally {
            this.isReconnecting = false;
        }
        return false;
    }

    // 连接恢复时的处理
    private async onConnectionRestored(): Promise<void> {
        // 确保回调存在且连接状态正确
        if (this.onReconnect && this.isConnected && !this.isReconnecting) {
            await this.onReconnect();
        }
    }

    // 重连回调
    public onReconnect?: () => Promise<void>;

    private async sendRequest<T extends BaseMessage>(data: T): Promise<void> {
        // 如果未连接，先尝试重连
        if (!this.isConnected) {
            const connected = await this.checkConnection();
            if (!connected) {
                console.log(`[${PLUGIN_NAME}] 服务器未连接`);
                return;
            }
        }

        data.timestamp = Date.now();
        // console.log(`[${PLUGIN_NAME}] 发送请求: ${data.type}, data: ${JSON.stringify(data.data).substring(0, 100)}`);

        try {
            const response = await fetch(`http://127.0.0.1:${this.port}`, {
                method: "POST",
                body: JSON.stringify(data),
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[${PLUGIN_NAME}] 发送请求失败:`, errorMessage);
            this.isConnected = false;
            // 不要在这里再次调用 checkConnection，避免循环
        }
    }

    // 发送错误消息
    // private async sendError(message: string): Promise<void> {
    //     console.error(`[${PLUGIN_NAME}] ${message}`);
    //     try {
    //         await fetch(`http://127.0.0.1:${this.port}`, {
    //             method: "POST",
    //             body: JSON.stringify({
    //                 type: MessageType.ERROR,
    //                 timestamp: Date.now(),
    //                 data: { message }
    //             } satisfies ErrorMessage),
    //             headers: {
    //                 "Content-Type": "application/json"
    //             }
    //         });
    //     } catch {
    //         // 忽略发送错误消息时的错误
    //     }
    // }

    // 发送歌词
    async sendLyric(lyrics: LyricData): Promise<void> {
        await this.sendRequest<LyricMessage>({
            type: MessageType.LYRIC,
            timestamp: 0,
            data: lyrics
        });
    }

    // 发送歌曲信息
    async sendSongInfo(info: SongInfo): Promise<void> {
        await this.sendRequest<SongMessage>({
            type: MessageType.SONG_CHANGE,
            timestamp: 0,
            data: info
        });
    }

    // 发送播放进度
    async sendProgress(time: number, duration: number): Promise<void> {
        await this.sendRequest<ProgressMessage>({
            type: MessageType.PROGRESS,
            timestamp: 0,
            data: { time, duration }
        });
    }

    // 发送播放状态
    async sendPlayState(state: 'resume' | 'pause'): Promise<void> {
        await this.sendRequest<PlayStateMessage>({
            type: MessageType.PLAY_STATE,
            timestamp: 0,
            data: { state }
        });
    }

    // 更新端口
    async updatePort(newPort: number): Promise<void> {
        // 1. 清理旧的资源
        this.dispose();

        // 2. 更新端口
        this.port = newPort;

        // 3. 重新初始化
        this.isConnected = false;
        await this.startConnectionCheck();

        // 4. 重新发送当前数据
        if (this.onReconnect) {
            await this.onReconnect();
        }
    }

    // 清理资源
    dispose(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = undefined;
        }
        this.isConnected = false;
    }
} 