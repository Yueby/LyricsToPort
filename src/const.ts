// 基础配置
export const PLUGIN_NAME = "LyricsToPort";
export const DEFAULT_PORT = 35010;

// WebSocket 配置
export const WS_CONFIG = {
    RECONNECT_DELAY: 3000,    // 重连延迟(ms)
    MAX_QUEUE_SIZE: 100,      // 最大消息队列长度
    MAX_RECONNECT_ATTEMPTS: 5 // 最大重连次数
} as const;

// 歌词来源
export enum LyricSource {
    REFINED = 0,     // RefinedNowPlaying
    LIBLYRIC = 1,    // LibLyric
    INTERNAL = 2     // 软件内歌词
}

export const SOURCE_NAMES = {
    [LyricSource.REFINED]: 'RefinedNowPlaying',
    [LyricSource.LIBLYRIC]: 'LibLyric',
    [LyricSource.INTERNAL]: '软件内歌词'
} as const;

// 配置键名
export const CONFIG_KEYS = {
    PORT: `${PLUGIN_NAME}.config.port`,
    LYRIC_SOURCE: `${PLUGIN_NAME}.config.lyricSource`
} as const;

// 消息类型
export enum MessageType {
    SONG_CHANGE = 'song',    // 歌曲切换
    LYRIC = 'lyric',         // 歌词更新
    PROGRESS = 'progress',   // 播放进度
    ERROR = 'error'          // 错误信息
}

// 接口定义
export interface Artist {
    id: number;
    name: string;
}

export interface Album {
    id: number;
    name: string;
    picUrl: string;
}

export interface SongInfo {
    id: number;
    name: string;
    alias: string[];
    artists: Artist[];
    album: Album;
    duration: number;
    transNames?: string[];
}

export interface DynamicLyricWord {
    time: number;
    duration: number;
    flag: number;
    word: string;
}

export interface LyricLine {
    time: number;
    duration: number;
    originalLyric: string;
    translatedLyric?: string;
    romanLyric?: string;
    dynamicLyric?: DynamicLyricWord[];
}

// 歌词数据
export interface LyricData {
    lines: LyricLine[];
}

// 完整歌词数据
export interface FullLyricData {
    lines: LyricLine[];          // 所有歌词行
    currentLine?: LyricData;     // 当前播放的歌词
    nextLine?: LyricData;        // 下一句歌词
    hasTranslation: boolean;     // 是否有翻译
    hasRoman: boolean;           // 是否有罗马音
    hasDynamic: boolean;         // 是否有逐字歌词
}

// 消息接口
export interface Message<T = unknown> {
    type: MessageType;
    timestamp: number;
    data: T;
}

// 歌曲消息数据
export interface SongData {
    id: number;
    name: string;
    artists: string;     // 已合并的艺术家名称
    album: string;       // 专辑名称
    duration: number;    // 时长(ms)
    lyrics?: LyricData;  // 歌词数据
}

// 进度消息数据
export interface ProgressData {
    time: number;        // 当前时间(s)
    formatted: string;   // 格式化时间
    percentage: number;  // 播放百分比
}

// 错误消息数据
export interface ErrorData {
    message: string;
}

// UI 配置接口
export interface ConfigProps {
    onSave: (port: number) => void;
    onLyricSourceChange: (source: LyricSource) => void;
    defaultPort: number;
    defaultLyricSource: LyricSource;
}

export interface EAPIResponse {
    code: number;
    error?: string;
}

export interface EAPILyric {
    version: number;
    lyric: string;
}

export interface EAPILyricResponse extends EAPIResponse {
    lrc?: EAPILyric;
    tlyric?: EAPILyric;
    romalrc?: EAPILyric;
    yrc?: EAPILyric;
}

export interface LyricPureLine {
    time: number;
    lyric: string;
}

// WebSocket 消息接口
export interface WSMessage<T = unknown> {
    type: MessageType;
    timestamp: number;
    data: T;
}

export interface ProgressInfo {
    time: number;
    formatted: string;
    percentage: number;
}

export interface ErrorMessage {
    message: string;
}

