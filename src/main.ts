import {
    CONFIG_KEYS,
    DEFAULT_PORT,
    LyricSource,
    PLUGIN_NAME,
    ProgressInfo,
    SongInfo,
    SOURCE_NAMES
} from "./const";
import { processLyrics, stopInternalLyrics } from "./lyric";
import { SocketManager } from "./websocket";
import { Config } from "./ui/config";

let socketManager: SocketManager | null = null;

// 读取配置
async function getConfig<T>(key: string, defaultValue: T): Promise<T> {
    const value = await betterncm.app.readConfig(key, String(defaultValue));
    return typeof defaultValue === 'number' ? Number(value) as T : value as T;
}

// 保存配置
async function saveConfig<T>(key: string, value: T): Promise<void> {
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
        console.error(`[${PLUGIN_NAME}] 等待播放数据超时`);
        throw error;
    }
}

// 获取当前歌曲信息
function getCurrentSongInfo(): SongInfo | null {
    const playing = betterncm.ncm.getPlayingSong();
    if (!playing?.data) return null;

    return {
        id: playing.data.id,
        name: playing.data.name,
        alias: playing.data.alias || [],
        artists: playing.data.artists?.map(artist => ({
            id: artist.id,
            name: artist.name
        })) || [],
        album: {
            id: playing.data.album?.id,
            name: playing.data.album?.name,
            picUrl: playing.data.album?.picUrl
        },
        duration: playing.data.duration,
        transNames: playing.data.transNames
    };
}

// 切换歌词来源并获取歌词
async function switchLyricSource(source: LyricSource) {
    const songInfo = getCurrentSongInfo();
    if (!songInfo) return;

    console.log(`[${PLUGIN_NAME}] 切换歌词来源:`, SOURCE_NAMES[source]);

    stopInternalLyrics();
    const lyrics = await processLyrics(songInfo.id, source);

    if (lyrics) {
        console.log(`[${PLUGIN_NAME}] 获取到歌词:`, {
            来源: SOURCE_NAMES[source],
            总行数: lyrics.lines.length,
            示例: lyrics.lines.slice(0, 2),
            是否有逐字歌词: lyrics.lines.some(line => line.dynamicLyric?.length > 0)
        });
    }
}

// 处理歌曲切换
async function handleSongChange() {
    const songInfo = getCurrentSongInfo();
    if (!songInfo) return;

    const source = Number(await betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, LyricSource.REFINED.toString()));
    const lyrics = await processLyrics(songInfo.id, source);

    // 发送歌曲基本信息
    socketManager?.sendSongChange({
        ...songInfo
    });

    // 单独发送歌词数据
    if (lyrics) {
        socketManager?.sendLyric(lyrics);
    }
}

// 监听播放进度
function startPlaybackMonitor() {
    // 监听歌曲切换
    legacyNativeCmder.appendRegisterCall("Load", "audioplayer", handleSongChange);

    // 监听播放进度
    const handleProgress = (_, time: number) => {
        const songInfo = getCurrentSongInfo();
        if (!songInfo) return;

        const progressData: ProgressInfo = {
            time,
            formatted: `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`,
            percentage: (time / (songInfo.duration / 1000)) * 100
        };

        socketManager?.sendProgress(progressData);
    };

    legacyNativeCmder.appendRegisterCall("PlayProgress", "audioplayer", handleProgress);
}

// 停止监听
function stopPlaybackMonitor() {
    legacyNativeCmder.removeRegisterCall("Load", "audioplayer");
    legacyNativeCmder.removeRegisterCall("PlayProgress", "audioplayer");
}

// 插件加载时执行
plugin.onLoad(async () => {
    try {
        await waitForPlayingData();

        const savedPort = Number(await betterncm.app.readConfig(CONFIG_KEYS.PORT, DEFAULT_PORT.toString()));

        // 初始化 WebSocket
        socketManager = new SocketManager(savedPort);

        startPlaybackMonitor();
        await handleSongChange();

    } catch (error) {
        console.error(`[${PLUGIN_NAME}] 插件加载失败:`, error);
        socketManager?.sendError(String(error));
    }
});

// 配置界面
plugin.onConfig(() => {
    const element = document.createElement("div");
    ReactDOM.render(React.createElement(Config, {
        onSave: port => {
            betterncm.app.writeConfig(CONFIG_KEYS.PORT, port.toString());
            console.log(`[${PLUGIN_NAME}] 端口已更新:`, port);
            // 更新 WebSocket 连接
            socketManager?.updatePort(port);
        },
        onLyricSourceChange: async source => {
            await betterncm.app.writeConfig(CONFIG_KEYS.LYRIC_SOURCE, source.toString());
            await handleSongChange();
        },
        defaultPort: DEFAULT_PORT,
        defaultLyricSource: LyricSource.REFINED
    }), element);
    return element;
});