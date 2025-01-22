import {
    CONFIG_KEYS,
    DEFAULT_PORT,
    LyricData,
    LyricSource,
    PLUGIN_NAME,
    SongInfo,
    SOURCE_NAMES
} from "./const";
import { processLyrics } from "./lyric";
import { LyricServer } from "./server";
import { Config } from "./ui/config";
import { throttle } from "./utils";
import { monitorEvents } from "./utils/events";

let lyricServer: LyricServer | null = null;

// 缓存当前歌词数据
let currentLyrics: LyricData | null = null;
let lastProgressTime = 0;
let lastPlayState: 'pause' | 'resume' = 'pause';

// 读取配置
async function getConfig<T extends string | number>(key: string, defaultValue: T): Promise<T> {
    const value = await betterncm.app.readConfig(key, String(defaultValue));
    return typeof defaultValue === 'number' ? Number(value) as T : value as T;
}

// 保存配置
async function saveConfig<T extends string | number>(key: string, value: T): Promise<void> {
    await betterncm.app.writeConfig(key, String(value));
    console.log(`[${PLUGIN_NAME}] 配置已保存:`, { key, value });
}

// 等待播放数据加载
async function waitForPlayingData(): Promise<void> {
    try {
        await betterncm.utils.waitForFunction(
            () => {
                const data = betterncm.ncm.getPlayingSong()?.data;
                if (data) {
                    console.log(`[${PLUGIN_NAME}] 播放数据已加载:`, data.name);
                    return true;
                }
                return false;
            },
            100
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${PLUGIN_NAME}] 等待播放数据超时:`, errorMessage);
        throw error;
    }
}

// 获取当前歌曲信息
function getCurrentSongInfo(): SongInfo | null {
    const playing = betterncm.ncm.getPlayingSong();
    if (!playing?.data) {
        console.log(`[${PLUGIN_NAME}] 获取当前歌曲数据失败`);
        return null;
    }

    return {
        id: playing.data.id,
        name: playing.data.name,
        alias: playing.data.alias || [],
        artists: playing.data.artists?.map(artist => ({
            id: artist.id,
            name: artist.name
        })) || [],
        album: {
            id: playing.data.album?.id || 0,
            name: playing.data.album?.name || '',
            picUrl: playing.data.album?.picUrl || ''
        },
        duration: playing.data.duration,
        transNames: playing.data.transNames
    };
}

// 处理歌曲切换
async function handleSongChange() {
    const songInfo = getCurrentSongInfo();
    if (!songInfo) {
        return;
    }

    const source = Number(await betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, LyricSource.REFINED.toString()));
    const lyrics = await processLyrics(songInfo.id, source);

    currentLyrics = lyrics;
    console.log(`[${PLUGIN_NAME}] 从歌词源"${SOURCE_NAMES[source]}"获取到《${songInfo.name}》的歌词，${lyrics.lines.length}行\n`, lyrics.lines);

    // 更新UI
    monitorEvents.emit({
        song: songInfo,
        lyrics: lyrics
    });

    // 发送数据
    await lyricServer?.sendSongInfo(songInfo);
    await lyricServer?.sendLyric(lyrics);
    await lyricServer?.sendPlayState(lastPlayState);
}

// 监听播放进度
const handleProgress = throttle((_, time: number) => {
    const songInfo = getCurrentSongInfo();
    if (!songInfo) return;
    
    // 避免重复发送相同进度
    const msTime = Math.floor(time * 1000);
    if (msTime === lastProgressTime) return;
    lastProgressTime = msTime;
    
    // 更新UI
    monitorEvents.emit({
        progress: { time: msTime, duration: songInfo.duration }
    });

    // 发送数据
    lyricServer?.sendProgress(msTime, songInfo.duration);
}, 100);

// 监听播放状态
const handlePlayState = async (evt: unknown, playStateData: string) => {
    const [_, state] = playStateData.split('|');
    if (state !== 'resume' && state !== 'pause') {
        console.error(`[${PLUGIN_NAME}] 未知的播放状态:`, state);
        return;
    }

    // 更新UI
    monitorEvents.emit({
        playState: state
    });
    lastPlayState = state;

    // 发送数据
    lyricServer?.sendPlayState(state);
};

// 监听播放进度和状态
function startPlaybackMonitor() {
    // 监听歌曲切换
    legacyNativeCmder.appendRegisterCall("Load", "audioplayer", handleSongChange);

    // 监听播放进度
    legacyNativeCmder.appendRegisterCall("PlayProgress", "audioplayer", handleProgress);

    // 监听播放状态
    legacyNativeCmder.appendRegisterCall("PlayState", "audioplayer", handlePlayState);
}

// 停止监听
function stopPlaybackMonitor() {
    legacyNativeCmder.removeRegisterCall("Load", "audioplayer");
    legacyNativeCmder.removeRegisterCall("PlayProgress", "audioplayer");
    legacyNativeCmder.removeRegisterCall("PlayState", "audioplayer");
}

// 插件加载时执行
plugin.onLoad(async () => {
    try {
        await waitForPlayingData();
        const savedPort = await getConfig(CONFIG_KEYS.PORT, DEFAULT_PORT);

        // 启动歌词服务器
        lyricServer = new LyricServer(savedPort);

        // 设置重连回调
        lyricServer.onReconnect = async () => {
            const songInfo = getCurrentSongInfo();
            if (!songInfo) {
                return;
            }
            await lyricServer?.sendSongInfo(songInfo);
            await lyricServer?.sendLyric(currentLyrics);
            await lyricServer?.sendPlayState(lastPlayState);
        };

        // 先发送初始信息
        await handleSongChange();

        // 再启动进度监听和状态监听
        startPlaybackMonitor();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${PLUGIN_NAME}] 插件加载失败:`, errorMessage);
    }
});

// 配置界面
plugin.onConfig(() => {
    const element = document.createElement("div");
    ReactDOM.render(React.createElement(Config, {
        onSave: async port => {
            await betterncm.app.writeConfig(CONFIG_KEYS.PORT, port.toString());
            console.log(`[${PLUGIN_NAME}] 端口已更新:`, port);
            await lyricServer?.updatePort(port);
        },
        onLyricSourceChange: async source => {
            await betterncm.app.writeConfig(CONFIG_KEYS.LYRIC_SOURCE, source.toString());
            console.log(`[${PLUGIN_NAME}] 歌词来源已更新:`, source);
        },
        defaultPort: DEFAULT_PORT,
        defaultLyricSource: LyricSource.REFINED
    }), element);
    return element;
});