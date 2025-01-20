import {
    PLUGIN_NAME,
    LyricData,
    LyricLine,
    EAPILyricResponse,
    LyricSource
} from "./const";

let observer: MutationObserver | null = null;

// 从 RefinedNowPlaying 获取歌词
async function getRefinedLyrics(): Promise<LyricData | null> {
    if (!window.onProcessLyrics) {
        console.log(`[${PLUGIN_NAME}] RefinedNowPlaying 未加载`);
        return null;
    }

    const refinedLyrics = await new Promise<any>(resolve => {
        // 保存原始回调
        const originalCallback = window.onProcessLyrics;
        
        // 这里的问题是我们没有恢复原始回调，导致每次都会创建新的回调
        window.onProcessLyrics = (lyrics: any) => {
            console.log(`[${PLUGIN_NAME}] RefinedNowPlaying 原始数据:`, {
                hasCallback: !!originalCallback,
                rawLyrics: lyrics
            });
            
            // 调用原始回调
            originalCallback(lyrics);
            
            // 获取处理后的数据
            resolve(window.currentLyrics);
            
            // 恢复原始回调
            window.onProcessLyrics = originalCallback;
        };
    });

    if (refinedLyrics?.lyrics?.length > 0) {
        console.log(`[${PLUGIN_NAME}] 从 RefinedNowPlaying 获取歌词:`, refinedLyrics);
        return { lines: refinedLyrics.lyrics };
    }

    console.log(`[${PLUGIN_NAME}] RefinedNowPlaying 未返回有效数据`);
    return null;
}

// 从 LibLyric 获取歌词
async function getLibLyricLyrics(songId: number): Promise<LyricData | null> {
    const lyricData = await loadedPlugins.liblyric.getLyricData(songId) as EAPILyricResponse;
    console.log(`[${PLUGIN_NAME}] 原始歌词数据:`, lyricData);

    if (lyricData.code !== 200) {
        console.error(`[${PLUGIN_NAME}] 歌词API错误:`, lyricData.error);
        return null;
    }

    const original = (lyricData.lrc?.lyric ?? '').replace(/\u3000/g, ' ');
    const translation = lyricData.tlyric?.lyric ?? '';
    const roma = lyricData.romalrc?.lyric ?? '';
    const dynamic = lyricData.yrc?.lyric ?? '';

    const lines = loadedPlugins.liblyric.parseLyric(
        original,
        translation,
        roma,
        dynamic
    ) as LyricLine[];

    return { lines };
}

// 从软件内获取歌词
async function getInternalLyrics(): Promise<LyricData | null> {
    try {
        const mLyric = await betterncm.utils.waitForElement("#x-g-mn .m-lyric", 100);
        if (!mLyric) {
            console.error(`[${PLUGIN_NAME}] 无法找到歌词元素`);
            return null;
        }

        // 使用 debounce 优化歌词更新处理
        const handleLyricChange = betterncm.utils.debounce((mutations: MutationRecord[]) => {
            for (const mutation of mutations) {
                const line: LyricLine = {
                    time: Date.now(),
                    duration: 0,
                    originalLyric: "",
                    translatedLyric: ""
                };

                if (mutation.addedNodes[2]) {
                    line.originalLyric = mutation.addedNodes[0].firstChild?.textContent || "";
                    line.translatedLyric = mutation.addedNodes[2].firstChild?.textContent || "";
                } else if (mutation.addedNodes[0]) {
                    line.originalLyric = mutation.addedNodes[0].textContent || "";
                }

                return { lines: [line] };
            }
        }, 50);

        observer = new MutationObserver(handleLyricChange);
        observer.observe(mLyric, { childList: true, subtree: true });

        return { lines: [] }; // 初始返回空歌词
    } catch (error) {
        console.error(`[${PLUGIN_NAME}] 监听歌词失败:`, error);
        return null;
    }
}

// 停止监听软件内歌词
export function stopInternalLyrics() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

// 处理歌词数据
export async function processLyrics(songId: number, source: LyricSource = LyricSource.REFINED): Promise<LyricData | null> {
    try {
        // 如果切换来源，先停止之前的监听
        stopInternalLyrics();

        switch (source) {
            case LyricSource.REFINED:
                const refinedLyrics = await getRefinedLyrics();
                if (refinedLyrics) return refinedLyrics;
                // 如果获取失败，回退到 LibLyric
                return getLibLyricLyrics(songId);

            case LyricSource.LIBLYRIC:
                return getLibLyricLyrics(songId);

            case LyricSource.INTERNAL:
                return getInternalLyrics();

            default:
                return null;
        }
    } catch (error) {
        console.error(`[${PLUGIN_NAME}] 处理歌词失败:`, error);
        return null;
    }
} 