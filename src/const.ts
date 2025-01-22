import { LyricLine } from "./liblyric";

// 基础配置
export const PLUGIN_NAME = "LyricsToPort";
export const DEFAULT_PORT = 35010;

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
    PLAY_STATE = 'state',    // 播放状态
    ERROR = 'error'          // 错误信息
}

// 发送到端口的数据接口
export interface BaseMessage<T = unknown> {
    type: MessageType;
    timestamp: number;
    data: T;
}

export interface SongMessage extends BaseMessage<SongInfo> {
    type: MessageType.SONG_CHANGE;
}

export interface LyricMessage extends BaseMessage<LyricData> {
    type: MessageType.LYRIC;
}

export interface SingleLyricMessage extends BaseMessage<{
    original: string;
    translated?: string;
    time?: number;
}> {
    type: MessageType.LYRIC;
}

export interface ProgressMessage extends BaseMessage<{
    time: number;      // 当前播放时间(ms)
    duration: number;  // 总时长(ms)
}> {
    type: MessageType.PROGRESS;
}

export interface PlayStateMessage extends BaseMessage<{
    state: 'resume' | 'pause';  // 播放状态
}> {
    type: MessageType.PLAY_STATE;
}

export interface ErrorMessage extends BaseMessage<{
    message: string;
}> {
    type: MessageType.ERROR;
}

// 原有的数据接口（用于从网易云获取数据）
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

// 歌词数据接口
export interface LyricData {
    lines: LyricLine[];
}

// 监视器状态接口
export interface MonitorState {
    song?: SongInfo;
    lyrics?: LyricData;
    progress?: {
        time: number;
        duration: number;
    };
    playState?: 'resume' | 'pause';
    currentLyric?: string;  // 添加当前歌词字段
}
