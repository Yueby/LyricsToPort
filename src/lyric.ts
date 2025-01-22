import { PLUGIN_NAME, LyricSource, LyricData } from "./const";
import { LyricLine, EAPILyricResponse } from "./liblyric";

let observer: MutationObserver | null = null;

// 从 RefinedNowPlaying 获取歌词
async function getRefinedLyrics(songId: number): Promise<LyricData | null> {
    if (!window.onProcessLyrics) {
        console.log(`[${PLUGIN_NAME}] RefinedNowPlaying 未加载`);
        return null;
    }

    // 等待歌词哈希值匹配当前歌曲
    await betterncm.utils.waitForFunction(
        () => window.currentLyrics?.hash?.includes(songId),
        100  // 检查间隔
    );

    // 获取匹配的歌词
    const currentLyrics = window.currentLyrics;
    // console.log(`[${PLUGIN_NAME}] RefinedNowPlaying 当前歌词:`, currentLyrics);

    if (currentLyrics?.lyrics?.length > 0) {
        return { lines: currentLyrics.lyrics };
    }

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
        // 等待歌词元素加载
        const lrcElements = await betterncm.utils.waitForElement(".j-flag.m-lyric", 100);
        if (!lrcElements) {
            console.error(`[${PLUGIN_NAME}] 无法找到歌词元素`);
            return null;
        }

        // 获取当前歌词
        const currentLyric = lrcElements.querySelector(".z-sel");
        if (!currentLyric) {
            return null;
        }

        // 获取当前歌词行
        const getCurrentLyric = (element: Element): LyricLine => ({
            time: Date.now(),
            duration: 0,
            originalLyric: element.querySelector(".f-thide")?.textContent || "",
            translatedLyric: element.querySelector(".f-thide.f-brk")?.textContent || ""
        });

        // 设置观察器监听歌词变化
        if (!observer) {
            observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    const addedNodes = mutation.addedNodes;
                    if (addedNodes.length > 0) {
                        let lyrics = {
                            basic: "",
                            extra: ""
                        };

                        // 参考任务栏歌词插件的处理方式
                        if (addedNodes[2]) {
                            lyrics.basic = addedNodes[0].firstChild?.textContent || "";
                            lyrics.extra = addedNodes[2].firstChild?.textContent || "";
                        } else {
                            lyrics.basic = addedNodes[0].textContent || "";
                        }

                        // TODO: 发送新的歌词行
                        console.log(`[${PLUGIN_NAME}] 歌词更新:`, lyrics);
                    }
                }
            });

            observer.observe(lrcElements, {
                childList: true,
                subtree: true
            });
        }

        const line = getCurrentLyric(currentLyric);
        return { lines: [line] };
    } catch (error) {
        console.error(`[${PLUGIN_NAME}] 获取软件内歌词失败:`, error);
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
export async function processLyrics(
    songId: number,
    source: LyricSource = LyricSource.REFINED
): Promise<LyricData> {
    try {
        let lyricData: LyricData | null = null;

        // 获取歌词
        switch (source) {
            case LyricSource.REFINED:
                lyricData = await getRefinedLyrics(songId);
                if (!lyricData) {
                    lyricData = await getLibLyricLyrics(songId);
                }
                break;

            case LyricSource.LIBLYRIC:
                lyricData = await getLibLyricLyrics(songId);
                break;

            case LyricSource.INTERNAL:
                lyricData = await getInternalLyrics();
                break;
        }

        if (!lyricData) {
            console.error(`[${PLUGIN_NAME}] 无法获取歌词`);
            return { lines: [] };
        }

        // 清除空白行
        lyricData.lines = lyricData.lines.filter(line => line.originalLyric.trim() !== "");

        // 处理纯音乐
        if (
            lyricData.lines.length === 1 &&
            lyricData.lines[0].time === 0 &&
            lyricData.lines[0].duration !== 0
        ) {
            return { lines: [] };
        }

        return lyricData;
    } catch (error) {
        console.error(`[${PLUGIN_NAME}] 处理歌词失败:`, error);
        return { lines: [] };
    }
}