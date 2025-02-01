(() => {
  // src/const.ts
  var PLUGIN_NAME = "LyricsToPort";
  var DEFAULT_PORT = 35010;
  var SOURCE_NAMES = {
    [0 /* REFINED */]: "RefinedNowPlaying",
    [1 /* LIBLYRIC */]: "LibLyric",
    [2 /* INTERNAL */]: "\u8F6F\u4EF6\u5185\u6B4C\u8BCD"
  };
  var CONFIG_KEYS = {
    PORT: `${PLUGIN_NAME}.config.port`,
    LYRIC_SOURCE: `${PLUGIN_NAME}.config.lyricSource`
  };

  // src/lyric.ts
  var observer = null;
  async function getRefinedLyrics(songId) {
    if (!window.onProcessLyrics) {
      console.log(`[${PLUGIN_NAME}] RefinedNowPlaying \u672A\u52A0\u8F7D`);
      return null;
    }
    await betterncm.utils.waitForFunction(
      () => window.currentLyrics?.hash?.includes(songId),
      100
      // 检查间隔
    );
    const currentLyrics2 = window.currentLyrics;
    if (currentLyrics2?.lyrics?.length > 0) {
      return { lines: currentLyrics2.lyrics };
    }
    return null;
  }
  async function getLibLyricLyrics(songId) {
    const lyricData = await loadedPlugins.liblyric.getLyricData(songId);
    console.log(`[${PLUGIN_NAME}] \u539F\u59CB\u6B4C\u8BCD\u6570\u636E:`, lyricData);
    if (lyricData.code !== 200) {
      console.error(`[${PLUGIN_NAME}] \u6B4C\u8BCDAPI\u9519\u8BEF:`, lyricData.error);
      return null;
    }
    const original = (lyricData.lrc?.lyric ?? "").replace(/\u3000/g, " ");
    const translation = lyricData.tlyric?.lyric ?? "";
    const roma = lyricData.romalrc?.lyric ?? "";
    const dynamic = lyricData.yrc?.lyric ?? "";
    const lines = loadedPlugins.liblyric.parseLyric(
      original,
      translation,
      roma,
      dynamic
    );
    return { lines };
  }
  async function getInternalLyrics() {
    try {
      const lrcElements = await betterncm.utils.waitForElement(".j-flag.m-lyric", 100);
      if (!lrcElements) {
        console.error(`[${PLUGIN_NAME}] \u65E0\u6CD5\u627E\u5230\u6B4C\u8BCD\u5143\u7D20`);
        return null;
      }
      const currentLyric = lrcElements.querySelector(".z-sel");
      if (!currentLyric) {
        return null;
      }
      const getCurrentLyric = (element) => ({
        time: Date.now(),
        duration: 0,
        originalLyric: element.querySelector(".f-thide")?.textContent || "",
        translatedLyric: element.querySelector(".f-thide.f-brk")?.textContent || ""
      });
      if (!observer) {
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            const addedNodes = mutation.addedNodes;
            if (addedNodes.length > 0) {
              let lyrics = {
                basic: "",
                extra: ""
              };
              if (addedNodes[2]) {
                lyrics.basic = addedNodes[0].firstChild?.textContent || "";
                lyrics.extra = addedNodes[2].firstChild?.textContent || "";
              } else {
                lyrics.basic = addedNodes[0].textContent || "";
              }
              console.log(`[${PLUGIN_NAME}] \u6B4C\u8BCD\u66F4\u65B0:`, lyrics);
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
      console.error(`[${PLUGIN_NAME}] \u83B7\u53D6\u8F6F\u4EF6\u5185\u6B4C\u8BCD\u5931\u8D25:`, error);
      return null;
    }
  }
  async function processLyrics(songId, source = 0 /* REFINED */) {
    try {
      let lyricData = null;
      switch (source) {
        case 0 /* REFINED */:
          lyricData = await getRefinedLyrics(songId);
          if (!lyricData) {
            lyricData = await getLibLyricLyrics(songId);
          }
          break;
        case 1 /* LIBLYRIC */:
          lyricData = await getLibLyricLyrics(songId);
          break;
        case 2 /* INTERNAL */:
          lyricData = await getInternalLyrics();
          break;
      }
      if (!lyricData) {
        console.error(`[${PLUGIN_NAME}] \u65E0\u6CD5\u83B7\u53D6\u6B4C\u8BCD`);
        return { lines: [] };
      }
      lyricData.lines = lyricData.lines.filter((line) => line.originalLyric.trim() !== "");
      if (lyricData.lines.length === 1 && lyricData.lines[0].time === 0 && lyricData.lines[0].duration !== 0) {
        return { lines: [] };
      }
      return lyricData;
    } catch (error) {
      console.error(`[${PLUGIN_NAME}] \u5904\u7406\u6B4C\u8BCD\u5931\u8D25:`, error);
      return { lines: [] };
    }
  }

  // src/client.ts
  var LyricClient = class {
    // 最小重连间隔（毫秒）
    constructor(port) {
      this.isConnected = false;
      this.reconnectTimeout = 3e3;
      // 改用 number 类型
      this.isReconnecting = false;
      // 添加重连状态标记
      this.lastReconnectTime = 0;
      // 记录上次重连时间
      this.minReconnectInterval = 1e3;
      this.port = port;
      void this.startConnectionCheck();
    }
    async startConnectionCheck() {
      if (this.checkTimer) {
        clearInterval(this.checkTimer);
      }
      this.checkTimer = setInterval(() => {
        if (!this.isConnected) {
          void this.checkConnection();
        }
      }, this.reconnectTimeout);
      void this.checkConnection();
    }
    async checkConnection() {
      if (this.isReconnecting)
        return false;
      const now = Date.now();
      if (now - this.lastReconnectTime < this.minReconnectInterval) {
        return false;
      }
      try {
        this.isReconnecting = true;
        this.lastReconnectTime = now;
        const response = await fetch(`http://127.0.0.1:${this.port}/ping`, {
          method: "GET"
        });
        if (response.ok) {
          if (!this.isConnected) {
            console.log(`[${PLUGIN_NAME}] \u670D\u52A1\u5668\u5DF2\u8FDE\u63A5`);
            this.isConnected = true;
            Promise.resolve().then(() => this.onConnectionRestored());
          }
          return true;
        }
      } catch {
        if (this.isConnected) {
          console.log(`[${PLUGIN_NAME}] \u7B49\u5F85\u670D\u52A1\u5668\u8FDE\u63A5...`);
          this.isConnected = false;
        }
      } finally {
        this.isReconnecting = false;
      }
      return false;
    }
    // 连接恢复时的处理
    async onConnectionRestored() {
      if (this.onReconnect && this.isConnected && !this.isReconnecting) {
        await this.onReconnect();
      }
    }
    async sendRequest(data) {
      if (!this.isConnected) {
        const connected = await this.checkConnection();
        if (!connected) {
          console.log(`[${PLUGIN_NAME}] \u670D\u52A1\u5668\u672A\u8FDE\u63A5`);
          return;
        }
      }
      data.timestamp = Date.now();
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
        console.error(`[${PLUGIN_NAME}] \u53D1\u9001\u8BF7\u6C42\u5931\u8D25:`, errorMessage);
        this.isConnected = false;
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
    async sendLyric(lyrics) {
      await this.sendRequest({
        type: "lyric" /* LYRIC */,
        timestamp: 0,
        data: lyrics
      });
    }
    // 发送歌曲信息
    async sendSongInfo(info) {
      await this.sendRequest({
        type: "song" /* SONG_CHANGE */,
        timestamp: 0,
        data: info
      });
    }
    // 发送播放进度
    async sendProgress(time, duration) {
      await this.sendRequest({
        type: "progress" /* PROGRESS */,
        timestamp: 0,
        data: { time, duration }
      });
    }
    // 发送播放状态
    async sendPlayState(state) {
      await this.sendRequest({
        type: "state" /* PLAY_STATE */,
        timestamp: 0,
        data: { state }
      });
    }
    // 更新端口
    async updatePort(newPort) {
      this.dispose();
      this.port = newPort;
      this.isConnected = false;
      await this.startConnectionCheck();
      if (this.onReconnect) {
        await this.onReconnect();
      }
    }
    // 清理资源
    dispose() {
      if (this.checkTimer) {
        clearInterval(this.checkTimer);
        this.checkTimer = void 0;
      }
      this.isConnected = false;
    }
  };

  // src/utils/events.ts
  var EventEmitter = class {
    constructor() {
      this.listeners = [];
    }
    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      };
    }
    emit(data) {
      this.listeners.forEach((listener) => listener(data));
    }
  };
  var monitorEvents = new EventEmitter();

  // src/ui/monitor.tsx
  function Monitor() {
    const [state, setState] = React.useState({});
    React.useEffect(() => {
      const unsubscribe = monitorEvents.subscribe((newState) => {
        setState((prev) => ({ ...prev, ...newState }));
      });
      return () => unsubscribe();
    }, []);
    const styles = {
      container: {
        padding: "24px",
        backgroundColor: "#fff",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
        maxWidth: "900px",
        margin: "20px auto"
      },
      title: {
        fontSize: "20px",
        fontWeight: "bold",
        color: "#ff85a2",
        // 粉色标题
        marginBottom: "24px",
        paddingBottom: "12px",
        borderBottom: "2px solid #ffd6e0"
        // 浅粉色边框
      },
      grid: {
        display: "grid",
        gap: "24px",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))"
        // 自适应列数
      },
      section: {
        backgroundColor: "#fff9fa",
        // 超浅粉色背景
        padding: "20px",
        borderRadius: "12px",
        border: "1px solid #ffe4e8",
        // 浅粉色边框
        transition: "transform 0.2s ease",
        ":hover": {
          transform: "translateY(-2px)"
        }
      },
      sectionTitle: {
        fontSize: "16px",
        fontWeight: "bold",
        color: "#ff85a2",
        // 粉色标题
        marginBottom: "16px"
      },
      content: {
        color: "#4a4a4a",
        lineHeight: "1.8"
      },
      progressBar: {
        width: "100%",
        height: "6px",
        backgroundColor: "#ffe4e8",
        // 浅粉色背景
        borderRadius: "4px",
        overflow: "hidden",
        marginBottom: "12px"
      },
      progressFill: (percent) => ({
        width: `${percent}%`,
        height: "100%",
        backgroundColor: "#ff85a2",
        // 粉色进度条
        transition: "width 0.3s ease"
      }),
      label: {
        color: "#888",
        fontSize: "14px",
        minWidth: "60px",
        display: "inline-block"
      },
      value: {
        color: "#4a4a4a",
        marginLeft: "12px",
        fontSize: "14px"
      },
      lyricLine: (isActive) => ({
        padding: "6px 0",
        color: isActive ? "#ff85a2" : "#666",
        // 粉色高亮
        transition: "all 0.3s ease",
        fontSize: "14px",
        fontWeight: isActive ? "500" : "normal"
      }),
      playState: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
        color: "#ff85a2"
        // 粉色状态
      }
    };
    return /* @__PURE__ */ h("div", { style: styles.container }, /* @__PURE__ */ h("div", { style: styles.title }, "\u64AD\u653E\u72B6\u6001\u76D1\u89C6\u5668"), /* @__PURE__ */ h("div", { style: styles.grid }, /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u6B4C\u66F2\u4FE1\u606F"), state.song ? /* @__PURE__ */ h("div", { style: styles.content }, /* @__PURE__ */ h("div", null, /* @__PURE__ */ h("span", { style: styles.label }, "\u6807\u9898:"), /* @__PURE__ */ h("span", { style: styles.value }, state.song.name)), /* @__PURE__ */ h("div", null, /* @__PURE__ */ h("span", { style: styles.label }, "\u6B4C\u624B:"), /* @__PURE__ */ h("span", { style: styles.value }, state.song.artists.map((a) => a.name).join(" / "))), /* @__PURE__ */ h("div", null, /* @__PURE__ */ h("span", { style: styles.label }, "\u4E13\u8F91:"), /* @__PURE__ */ h("span", { style: styles.value }, state.song.album.name)), state.song.alias.length > 0 && /* @__PURE__ */ h("div", null, /* @__PURE__ */ h("span", { style: styles.label }, "\u522B\u540D:"), /* @__PURE__ */ h("span", { style: styles.value }, state.song.alias.join(" / ")))) : /* @__PURE__ */ h("div", { style: styles.content }, "\u65E0\u64AD\u653E\u4FE1\u606F")), /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u64AD\u653E\u8FDB\u5EA6"), state.progress ? /* @__PURE__ */ h("div", { style: styles.content }, /* @__PURE__ */ h("div", { style: styles.progressBar }, /* @__PURE__ */ h("div", { style: styles.progressFill(state.progress.time / state.progress.duration * 100) })), /* @__PURE__ */ h("div", { style: { marginTop: "8px", display: "flex", justifyContent: "space-between" } }, /* @__PURE__ */ h("span", null, Math.floor(state.progress.time / 1e3), "s"), /* @__PURE__ */ h("span", null, Math.floor(state.progress.duration / 1e3), "s"))) : /* @__PURE__ */ h("div", { style: styles.content }, "\u672A\u64AD\u653E")), /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u6B4C\u8BCD"), /* @__PURE__ */ h("div", { style: styles.content }, state.lyrics?.lines.map((line, index) => /* @__PURE__ */ h(
      "div",
      {
        key: index,
        style: styles.lyricLine(line.time <= (state.progress?.time || 0) && line.time + (line.duration || 0) >= (state.progress?.time || 0))
      },
      line.originalLyric
    )) || "\u65E0\u6B4C\u8BCD")), /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u64AD\u653E\u72B6\u6001"), /* @__PURE__ */ h("div", { style: styles.content }, /* @__PURE__ */ h("div", { style: styles.playState }, state.playState === "resume" ? "\u25B6 \u64AD\u653E\u4E2D" : "\u23F8 \u5DF2\u6682\u505C")))));
  }

  // src/ui/config.tsx
  function Config({ onSave, onLyricSourceChange, defaultPort, defaultLyricSource }) {
    const [port, setPort] = React.useState(defaultPort);
    const [lyricSource, setLyricSource] = React.useState(defaultLyricSource);
    const [showSuccess, setShowSuccess] = React.useState(false);
    React.useEffect(() => {
      betterncm.app.readConfig(CONFIG_KEYS.PORT, defaultPort.toString()).then((savedPort) => {
        setPort(Number(savedPort));
      });
      betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, defaultLyricSource.toString()).then((savedSource) => {
        setLyricSource(Number(savedSource));
      });
    }, [defaultPort, defaultLyricSource]);
    const handlePortChange = async () => {
      const portNum = Number(port);
      if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
        await onSave(portNum);
        await onLyricSourceChange(lyricSource);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2e3);
      }
    };
    const handleSourceChange = async (event) => {
      const newSource = Number(event.target.value);
      setLyricSource(newSource);
      await onLyricSourceChange(newSource);
    };
    const styles = {
      container: {
        padding: "24px",
        maxWidth: "900px",
        margin: "20px auto",
        backgroundColor: "#fff",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)"
      },
      title: {
        fontSize: "20px",
        fontWeight: "bold",
        color: "#ff85a2",
        marginBottom: "24px",
        paddingBottom: "12px",
        borderBottom: "2px solid #ffd6e0"
      },
      section: {
        marginBottom: "24px",
        padding: "20px",
        backgroundColor: "#fff9fa",
        borderRadius: "12px",
        border: "1px solid #ffe4e8"
      },
      sectionTitle: {
        fontSize: "16px",
        fontWeight: "bold",
        color: "#ff85a2",
        marginBottom: "16px"
      },
      label: {
        display: "block",
        color: "#666",
        fontSize: "14px"
      },
      inputGroup: {
        display: "flex",
        alignItems: "center",
        gap: "16px"
      },
      input: {
        padding: "10px 16px",
        border: "1px solid #ffd6e0",
        borderRadius: "8px",
        fontSize: "14px",
        width: "140px",
        transition: "all 0.3s",
        backgroundColor: "#fff",
        color: "#333",
        ":focus": {
          borderColor: "#ff85a2",
          boxShadow: "0 0 0 3px rgba(255,133,162,0.1)",
          outline: "none"
        }
      },
      select: {
        padding: "10px 16px",
        border: "1px solid #ffd6e0",
        borderRadius: "8px",
        fontSize: "14px",
        width: "220px",
        backgroundColor: "#fff",
        cursor: "pointer",
        color: "#333"
      },
      option: {
        color: "#333",
        backgroundColor: "#fff"
      },
      button: {
        padding: "10px 24px",
        backgroundColor: "#ff85a2",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        cursor: "pointer",
        transition: "all 0.3s",
        ":hover": {
          backgroundColor: "#ff9db5"
        }
      },
      toast: {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 24px",
        backgroundColor: "rgba(255,133,162,0.9)",
        color: "#fff",
        borderRadius: "8px",
        fontSize: "14px",
        boxShadow: "0 4px 12px rgba(255,133,162,0.2)",
        animation: "fadeIn 0.3s"
      }
    };
    return /* @__PURE__ */ h("div", { style: styles.container }, /* @__PURE__ */ h("div", { style: styles.title }, "\u63D2\u4EF6\u914D\u7F6E"), /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u670D\u52A1\u7AEF\u53E3"), /* @__PURE__ */ h("div", { style: styles.inputGroup }, /* @__PURE__ */ h(
      "input",
      {
        type: "number",
        value: port,
        onChange: (e) => setPort(Number(e.target.value)),
        style: styles.input,
        min: "1",
        max: "65535"
      }
    ), /* @__PURE__ */ h(
      "button",
      {
        onClick: handlePortChange,
        style: styles.button
      },
      "\u4FDD\u5B58"
    ))), /* @__PURE__ */ h("div", { style: styles.section }, /* @__PURE__ */ h("div", { style: styles.sectionTitle }, "\u6B4C\u8BCD\u6765\u6E90"), /* @__PURE__ */ h(
      "select",
      {
        value: lyricSource,
        onChange: handleSourceChange,
        style: styles.select
      },
      Object.entries(SOURCE_NAMES).map(([value, name]) => /* @__PURE__ */ h("option", { key: value, value, style: styles.option }, name))
    )), /* @__PURE__ */ h(Monitor, null), showSuccess && /* @__PURE__ */ h("div", { style: {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "12px 24px",
      backgroundColor: "rgba(255,133,162,0.9)",
      color: "#fff",
      borderRadius: "8px",
      fontSize: "14px",
      boxShadow: "0 4px 12px rgba(255,133,162,0.2)",
      animation: "fadeIn 0.3s"
    } }, "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58"));
  }

  // src/utils.ts
  function throttle(func, limit) {
    let inThrottle = false;
    return function(...args) {
      if (!inThrottle) {
        const result = func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
        return result;
      }
    };
  }

  // src/main.ts
  var lyricClient = null;
  var currentLyrics = null;
  var lastProgressTime = 0;
  var lastPlayState = "pause";
  async function getConfig(key, defaultValue) {
    const value = await betterncm.app.readConfig(key, String(defaultValue));
    return typeof defaultValue === "number" ? Number(value) : value;
  }
  async function saveConfig(key, value) {
    await betterncm.app.writeConfig(key, String(value));
    console.log(`[${PLUGIN_NAME}] \u914D\u7F6E\u5DF2\u4FDD\u5B58:`, { key, value });
  }
  async function waitForPlayingData() {
    try {
      await betterncm.utils.waitForFunction(
        () => {
          const data = betterncm.ncm.getPlayingSong()?.data;
          if (data) {
            console.log(`[${PLUGIN_NAME}] \u64AD\u653E\u6570\u636E\u5DF2\u52A0\u8F7D:`, data.name);
            return true;
          }
          return false;
        },
        100
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${PLUGIN_NAME}] \u7B49\u5F85\u64AD\u653E\u6570\u636E\u8D85\u65F6:`, errorMessage);
      throw error;
    }
  }
  function getCurrentSongInfo() {
    const playing = betterncm.ncm.getPlayingSong();
    if (!playing?.data) {
      console.log(`[${PLUGIN_NAME}] \u83B7\u53D6\u5F53\u524D\u6B4C\u66F2\u6570\u636E\u5931\u8D25`);
      return null;
    }
    return {
      id: playing.data.id,
      name: playing.data.name,
      alias: playing.data.alias || [],
      artists: playing.data.artists?.map((artist) => ({
        id: artist.id,
        name: artist.name
      })) || [],
      album: {
        id: playing.data.album?.id || 0,
        name: playing.data.album?.name || "",
        picUrl: playing.data.album?.picUrl || ""
      },
      duration: playing.data.duration,
      transNames: playing.data.transNames
    };
  }
  async function handleSongChange() {
    const songInfo = getCurrentSongInfo();
    if (!songInfo) {
      return;
    }
    const source = Number(await betterncm.app.readConfig(CONFIG_KEYS.LYRIC_SOURCE, 0 /* REFINED */.toString()));
    const lyrics = await processLyrics(songInfo.id, source);
    currentLyrics = lyrics;
    console.log(`[${PLUGIN_NAME}] \u4ECE\u6B4C\u8BCD\u6E90"${SOURCE_NAMES[source]}"\u83B7\u53D6\u5230\u300A${songInfo.name}\u300B\u7684\u6B4C\u8BCD\uFF0C${lyrics.lines.length}\u884C
`, lyrics.lines);
    monitorEvents.emit({
      song: songInfo,
      lyrics
    });
    await lyricClient?.sendSongInfo(songInfo);
    await lyricClient?.sendLyric(lyrics);
    await lyricClient?.sendPlayState(lastPlayState);
  }
  var handleProgress = throttle((_, time) => {
    const songInfo = getCurrentSongInfo();
    if (!songInfo)
      return;
    const msTime = Math.floor(time * 1e3);
    if (msTime === lastProgressTime)
      return;
    lastProgressTime = msTime;
    monitorEvents.emit({
      progress: { time: msTime, duration: songInfo.duration }
    });
    lyricClient?.sendProgress(msTime, songInfo.duration);
  }, 100);
  var handlePlayState = async (evt, playStateData) => {
    const [_, state] = playStateData.split("|");
    if (state !== "resume" && state !== "pause") {
      console.error(`[${PLUGIN_NAME}] \u672A\u77E5\u7684\u64AD\u653E\u72B6\u6001:`, state);
      return;
    }
    monitorEvents.emit({
      playState: state
    });
    lastPlayState = state;
    lyricClient?.sendPlayState(state);
  };
  function startPlaybackMonitor() {
    legacyNativeCmder.appendRegisterCall("Load", "audioplayer", handleSongChange);
    legacyNativeCmder.appendRegisterCall("PlayProgress", "audioplayer", handleProgress);
    legacyNativeCmder.appendRegisterCall("PlayState", "audioplayer", handlePlayState);
  }
  function stopPlaybackMonitor() {
    legacyNativeCmder.removeRegisterCall("Load", "audioplayer");
    legacyNativeCmder.removeRegisterCall("PlayProgress", "audioplayer");
    legacyNativeCmder.removeRegisterCall("PlayState", "audioplayer");
  }
  plugin.onConfig(() => {
    const element = document.createElement("div");
    ReactDOM.render(React.createElement(Config, {
      onSave: async (port) => {
        await saveConfig(CONFIG_KEYS.PORT, port);
        await lyricClient?.updatePort(port);
      },
      onLyricSourceChange: async (source) => {
        await saveConfig(CONFIG_KEYS.LYRIC_SOURCE, source);
        await handleSongChange();
      },
      defaultPort: DEFAULT_PORT,
      defaultLyricSource: 0 /* REFINED */
    }), element);
    return element;
  });
  plugin.onLoad(async () => {
    try {
      await waitForPlayingData();
      const savedPort = await getConfig(CONFIG_KEYS.PORT, DEFAULT_PORT);
      lyricClient = new LyricClient(savedPort);
      lyricClient.onReconnect = async () => {
        const songInfo = getCurrentSongInfo();
        if (!songInfo) {
          return;
        }
        await lyricClient?.sendSongInfo(songInfo);
        if (currentLyrics) {
          await lyricClient?.sendLyric(currentLyrics);
        }
        await lyricClient?.sendPlayState(lastPlayState);
      };
      await handleSongChange();
      startPlaybackMonitor();
      window.addEventListener("beforeunload", () => {
        stopPlaybackMonitor();
        lyricClient?.dispose();
        lyricClient = null;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${PLUGIN_NAME}] \u63D2\u4EF6\u52A0\u8F7D\u5931\u8D25:`, errorMessage);
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2NvbnN0LnRzIiwgIi4uL3NyYy9seXJpYy50cyIsICIuLi9zcmMvY2xpZW50LnRzIiwgIi4uL3NyYy91dGlscy9ldmVudHMudHMiLCAiLi4vc3JjL3VpL21vbml0b3IudHN4IiwgIi4uL3NyYy91aS9jb25maWcudHN4IiwgIi4uL3NyYy91dGlscy50cyIsICIuLi9zcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgTHlyaWNMaW5lIH0gZnJvbSBcIi4vbGlibHlyaWNcIjtcclxuXHJcbi8vIFx1NTdGQVx1Nzg0MFx1OTE0RFx1N0Y2RVxyXG5leHBvcnQgY29uc3QgUExVR0lOX05BTUUgPSBcIkx5cmljc1RvUG9ydFwiO1xyXG5leHBvcnQgY29uc3QgREVGQVVMVF9QT1JUID0gMzUwMTA7XHJcblxyXG4vLyBcdTZCNENcdThCQ0RcdTY3NjVcdTZFOTBcclxuZXhwb3J0IGVudW0gTHlyaWNTb3VyY2Uge1xyXG4gICAgUkVGSU5FRCA9IDAsICAgICAvLyBSZWZpbmVkTm93UGxheWluZ1xyXG4gICAgTElCTFlSSUMgPSAxLCAgICAvLyBMaWJMeXJpY1xyXG4gICAgSU5URVJOQUwgPSAyICAgICAvLyBcdThGNkZcdTRFRjZcdTUxODVcdTZCNENcdThCQ0RcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IFNPVVJDRV9OQU1FUyA9IHtcclxuICAgIFtMeXJpY1NvdXJjZS5SRUZJTkVEXTogJ1JlZmluZWROb3dQbGF5aW5nJyxcclxuICAgIFtMeXJpY1NvdXJjZS5MSUJMWVJJQ106ICdMaWJMeXJpYycsXHJcbiAgICBbTHlyaWNTb3VyY2UuSU5URVJOQUxdOiAnXHU4RjZGXHU0RUY2XHU1MTg1XHU2QjRDXHU4QkNEJ1xyXG59IGFzIGNvbnN0O1xyXG5cclxuLy8gXHU5MTREXHU3RjZFXHU5NTJFXHU1NDBEXHJcbmV4cG9ydCBjb25zdCBDT05GSUdfS0VZUyA9IHtcclxuICAgIFBPUlQ6IGAke1BMVUdJTl9OQU1FfS5jb25maWcucG9ydGAsXHJcbiAgICBMWVJJQ19TT1VSQ0U6IGAke1BMVUdJTl9OQU1FfS5jb25maWcubHlyaWNTb3VyY2VgXHJcbn0gYXMgY29uc3Q7XHJcblxyXG4vLyBcdTZEODhcdTYwNkZcdTdDN0JcdTU3OEJcclxuZXhwb3J0IGVudW0gTWVzc2FnZVR5cGUge1xyXG4gICAgU09OR19DSEFOR0UgPSAnc29uZycsICAgIC8vIFx1NkI0Q1x1NjZGMlx1NTIwN1x1NjM2MlxyXG4gICAgTFlSSUMgPSAnbHlyaWMnLCAgICAgICAgIC8vIFx1NkI0Q1x1OEJDRFx1NjZGNFx1NjVCMFxyXG4gICAgUFJPR1JFU1MgPSAncHJvZ3Jlc3MnLCAgIC8vIFx1NjRBRFx1NjUzRVx1OEZEQlx1NUVBNlxyXG4gICAgUExBWV9TVEFURSA9ICdzdGF0ZScsICAgIC8vIFx1NjRBRFx1NjUzRVx1NzJCNlx1NjAwMVxyXG4gICAgRVJST1IgPSAnZXJyb3InICAgICAgICAgIC8vIFx1OTUxOVx1OEJFRlx1NEZFMVx1NjA2RlxyXG59XHJcblxyXG4vLyBcdTUzRDFcdTkwMDFcdTUyMzBcdTdBRUZcdTUzRTNcdTc2ODRcdTY1NzBcdTYzNkVcdTYzQTVcdTUzRTNcclxuZXhwb3J0IGludGVyZmFjZSBCYXNlTWVzc2FnZTxUID0gdW5rbm93bj4ge1xyXG4gICAgdHlwZTogTWVzc2FnZVR5cGU7XHJcbiAgICB0aW1lc3RhbXA6IG51bWJlcjtcclxuICAgIGRhdGE6IFQ7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgU29uZ01lc3NhZ2UgZXh0ZW5kcyBCYXNlTWVzc2FnZTxTb25nSW5mbz4ge1xyXG4gICAgdHlwZTogTWVzc2FnZVR5cGUuU09OR19DSEFOR0U7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTHlyaWNNZXNzYWdlIGV4dGVuZHMgQmFzZU1lc3NhZ2U8THlyaWNEYXRhPiB7XHJcbiAgICB0eXBlOiBNZXNzYWdlVHlwZS5MWVJJQztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTaW5nbGVMeXJpY01lc3NhZ2UgZXh0ZW5kcyBCYXNlTWVzc2FnZTx7XHJcbiAgICBvcmlnaW5hbDogc3RyaW5nO1xyXG4gICAgdHJhbnNsYXRlZD86IHN0cmluZztcclxuICAgIHRpbWU/OiBudW1iZXI7XHJcbn0+IHtcclxuICAgIHR5cGU6IE1lc3NhZ2VUeXBlLkxZUklDO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFByb2dyZXNzTWVzc2FnZSBleHRlbmRzIEJhc2VNZXNzYWdlPHtcclxuICAgIHRpbWU6IG51bWJlcjsgICAgICAvLyBcdTVGNTNcdTUyNERcdTY0QURcdTY1M0VcdTY1RjZcdTk1RjQobXMpXHJcbiAgICBkdXJhdGlvbjogbnVtYmVyOyAgLy8gXHU2MDNCXHU2NUY2XHU5NTdGKG1zKVxyXG59PiB7XHJcbiAgICB0eXBlOiBNZXNzYWdlVHlwZS5QUk9HUkVTUztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQbGF5U3RhdGVNZXNzYWdlIGV4dGVuZHMgQmFzZU1lc3NhZ2U8e1xyXG4gICAgc3RhdGU6ICdyZXN1bWUnIHwgJ3BhdXNlJzsgIC8vIFx1NjRBRFx1NjUzRVx1NzJCNlx1NjAwMVxyXG59PiB7XHJcbiAgICB0eXBlOiBNZXNzYWdlVHlwZS5QTEFZX1NUQVRFO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEVycm9yTWVzc2FnZSBleHRlbmRzIEJhc2VNZXNzYWdlPHtcclxuICAgIG1lc3NhZ2U6IHN0cmluZztcclxufT4ge1xyXG4gICAgdHlwZTogTWVzc2FnZVR5cGUuRVJST1I7XHJcbn1cclxuXHJcbi8vIFx1NTM5Rlx1NjcwOVx1NzY4NFx1NjU3MFx1NjM2RVx1NjNBNVx1NTNFM1x1RkYwOFx1NzUyOFx1NEU4RVx1NEVDRVx1N0Y1MVx1NjYxM1x1NEU5MVx1ODNCN1x1NTNENlx1NjU3MFx1NjM2RVx1RkYwOVxyXG5leHBvcnQgaW50ZXJmYWNlIEFydGlzdCB7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEFsYnVtIHtcclxuICAgIGlkOiBudW1iZXI7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwaWNVcmw6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTb25nSW5mbyB7XHJcbiAgICBpZDogbnVtYmVyO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgYWxpYXM6IHN0cmluZ1tdO1xyXG4gICAgYXJ0aXN0czogQXJ0aXN0W107XHJcbiAgICBhbGJ1bTogQWxidW07XHJcbiAgICBkdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdHJhbnNOYW1lcz86IHN0cmluZ1tdO1xyXG59XHJcblxyXG4vLyBcdTZCNENcdThCQ0RcdTY1NzBcdTYzNkVcdTYzQTVcdTUzRTNcclxuZXhwb3J0IGludGVyZmFjZSBMeXJpY0RhdGEge1xyXG4gICAgbGluZXM6IEx5cmljTGluZVtdO1xyXG59XHJcblxyXG4vLyBcdTc2RDFcdTg5QzZcdTU2NjhcdTcyQjZcdTYwMDFcdTYzQTVcdTUzRTNcclxuZXhwb3J0IGludGVyZmFjZSBNb25pdG9yU3RhdGUge1xyXG4gICAgc29uZz86IFNvbmdJbmZvO1xyXG4gICAgbHlyaWNzPzogTHlyaWNEYXRhO1xyXG4gICAgcHJvZ3Jlc3M/OiB7XHJcbiAgICAgICAgdGltZTogbnVtYmVyO1xyXG4gICAgICAgIGR1cmF0aW9uOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgcGxheVN0YXRlPzogJ3Jlc3VtZScgfCAncGF1c2UnO1xyXG4gICAgY3VycmVudEx5cmljPzogc3RyaW5nOyAgLy8gXHU2REZCXHU1MkEwXHU1RjUzXHU1MjREXHU2QjRDXHU4QkNEXHU1QjU3XHU2QkI1XHJcbn1cclxuIiwgImltcG9ydCB7IFBMVUdJTl9OQU1FLCBMeXJpY1NvdXJjZSwgTHlyaWNEYXRhIH0gZnJvbSBcIi4vY29uc3RcIjtcclxuaW1wb3J0IHsgTHlyaWNMaW5lLCBFQVBJTHlyaWNSZXNwb25zZSB9IGZyb20gXCIuL2xpYmx5cmljXCI7XHJcblxyXG5sZXQgb2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbi8vIFx1NEVDRSBSZWZpbmVkTm93UGxheWluZyBcdTgzQjdcdTUzRDZcdTZCNENcdThCQ0RcclxuYXN5bmMgZnVuY3Rpb24gZ2V0UmVmaW5lZEx5cmljcyhzb25nSWQ6IG51bWJlcik6IFByb21pc2U8THlyaWNEYXRhIHwgbnVsbD4ge1xyXG4gICAgaWYgKCF3aW5kb3cub25Qcm9jZXNzTHlyaWNzKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFske1BMVUdJTl9OQU1FfV0gUmVmaW5lZE5vd1BsYXlpbmcgXHU2NzJBXHU1MkEwXHU4RjdEYCk7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gXHU3QjQ5XHU1Rjg1XHU2QjRDXHU4QkNEXHU1NEM4XHU1RTBDXHU1MDNDXHU1MzM5XHU5MTREXHU1RjUzXHU1MjREXHU2QjRDXHU2NkYyXHJcbiAgICBhd2FpdCBiZXR0ZXJuY20udXRpbHMud2FpdEZvckZ1bmN0aW9uKFxyXG4gICAgICAgICgpID0+IHdpbmRvdy5jdXJyZW50THlyaWNzPy5oYXNoPy5pbmNsdWRlcyhzb25nSWQpLFxyXG4gICAgICAgIDEwMCAgLy8gXHU2OEMwXHU2N0U1XHU5NUY0XHU5Njk0XHJcbiAgICApO1xyXG5cclxuICAgIC8vIFx1ODNCN1x1NTNENlx1NTMzOVx1OTE0RFx1NzY4NFx1NkI0Q1x1OEJDRFxyXG4gICAgY29uc3QgY3VycmVudEx5cmljcyA9IHdpbmRvdy5jdXJyZW50THlyaWNzO1xyXG4gICAgLy8gY29uc29sZS5sb2coYFske1BMVUdJTl9OQU1FfV0gUmVmaW5lZE5vd1BsYXlpbmcgXHU1RjUzXHU1MjREXHU2QjRDXHU4QkNEOmAsIGN1cnJlbnRMeXJpY3MpO1xyXG5cclxuICAgIGlmIChjdXJyZW50THlyaWNzPy5seXJpY3M/Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICByZXR1cm4geyBsaW5lczogY3VycmVudEx5cmljcy5seXJpY3MgfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuLy8gXHU0RUNFIExpYkx5cmljIFx1ODNCN1x1NTNENlx1NkI0Q1x1OEJDRFxyXG5hc3luYyBmdW5jdGlvbiBnZXRMaWJMeXJpY0x5cmljcyhzb25nSWQ6IG51bWJlcik6IFByb21pc2U8THlyaWNEYXRhIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgbHlyaWNEYXRhID0gYXdhaXQgbG9hZGVkUGx1Z2lucy5saWJseXJpYy5nZXRMeXJpY0RhdGEoc29uZ0lkKSBhcyBFQVBJTHlyaWNSZXNwb25zZTtcclxuICAgIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1NTM5Rlx1NTlDQlx1NkI0Q1x1OEJDRFx1NjU3MFx1NjM2RTpgLCBseXJpY0RhdGEpO1xyXG5cclxuICAgIGlmIChseXJpY0RhdGEuY29kZSAhPT0gMjAwKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihgWyR7UExVR0lOX05BTUV9XSBcdTZCNENcdThCQ0RBUElcdTk1MTlcdThCRUY6YCwgbHlyaWNEYXRhLmVycm9yKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvcmlnaW5hbCA9IChseXJpY0RhdGEubHJjPy5seXJpYyA/PyAnJykucmVwbGFjZSgvXFx1MzAwMC9nLCAnICcpO1xyXG4gICAgY29uc3QgdHJhbnNsYXRpb24gPSBseXJpY0RhdGEudGx5cmljPy5seXJpYyA/PyAnJztcclxuICAgIGNvbnN0IHJvbWEgPSBseXJpY0RhdGEucm9tYWxyYz8ubHlyaWMgPz8gJyc7XHJcbiAgICBjb25zdCBkeW5hbWljID0gbHlyaWNEYXRhLnlyYz8ubHlyaWMgPz8gJyc7XHJcblxyXG4gICAgY29uc3QgbGluZXMgPSBsb2FkZWRQbHVnaW5zLmxpYmx5cmljLnBhcnNlTHlyaWMoXHJcbiAgICAgICAgb3JpZ2luYWwsXHJcbiAgICAgICAgdHJhbnNsYXRpb24sXHJcbiAgICAgICAgcm9tYSxcclxuICAgICAgICBkeW5hbWljXHJcbiAgICApIGFzIEx5cmljTGluZVtdO1xyXG5cclxuICAgIHJldHVybiB7IGxpbmVzIH07XHJcbn1cclxuXHJcbi8vIFx1NEVDRVx1OEY2Rlx1NEVGNlx1NTE4NVx1ODNCN1x1NTNENlx1NkI0Q1x1OEJDRFxyXG5hc3luYyBmdW5jdGlvbiBnZXRJbnRlcm5hbEx5cmljcygpOiBQcm9taXNlPEx5cmljRGF0YSB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gXHU3QjQ5XHU1Rjg1XHU2QjRDXHU4QkNEXHU1MTQzXHU3RDIwXHU1MkEwXHU4RjdEXHJcbiAgICAgICAgY29uc3QgbHJjRWxlbWVudHMgPSBhd2FpdCBiZXR0ZXJuY20udXRpbHMud2FpdEZvckVsZW1lbnQoXCIuai1mbGFnLm0tbHlyaWNcIiwgMTAwKTtcclxuICAgICAgICBpZiAoIWxyY0VsZW1lbnRzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFske1BMVUdJTl9OQU1FfV0gXHU2NUUwXHU2Q0Q1XHU2MjdFXHU1MjMwXHU2QjRDXHU4QkNEXHU1MTQzXHU3RDIwYCk7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gXHU4M0I3XHU1M0Q2XHU1RjUzXHU1MjREXHU2QjRDXHU4QkNEXHJcbiAgICAgICAgY29uc3QgY3VycmVudEx5cmljID0gbHJjRWxlbWVudHMucXVlcnlTZWxlY3RvcihcIi56LXNlbFwiKTtcclxuICAgICAgICBpZiAoIWN1cnJlbnRMeXJpYykge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFx1ODNCN1x1NTNENlx1NUY1M1x1NTI0RFx1NkI0Q1x1OEJDRFx1ODg0Q1xyXG4gICAgICAgIGNvbnN0IGdldEN1cnJlbnRMeXJpYyA9IChlbGVtZW50OiBFbGVtZW50KTogTHlyaWNMaW5lID0+ICh7XHJcbiAgICAgICAgICAgIHRpbWU6IERhdGUubm93KCksXHJcbiAgICAgICAgICAgIGR1cmF0aW9uOiAwLFxyXG4gICAgICAgICAgICBvcmlnaW5hbEx5cmljOiBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoXCIuZi10aGlkZVwiKT8udGV4dENvbnRlbnQgfHwgXCJcIixcclxuICAgICAgICAgICAgdHJhbnNsYXRlZEx5cmljOiBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoXCIuZi10aGlkZS5mLWJya1wiKT8udGV4dENvbnRlbnQgfHwgXCJcIlxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBcdThCQkVcdTdGNkVcdTg5QzJcdTVCREZcdTU2NjhcdTc2RDFcdTU0MkNcdTZCNENcdThCQ0RcdTUzRDhcdTUzMTZcclxuICAgICAgICBpZiAoIW9ic2VydmVyKSB7XHJcbiAgICAgICAgICAgIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBtdXRhdGlvbiBvZiBtdXRhdGlvbnMpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGRlZE5vZGVzID0gbXV0YXRpb24uYWRkZWROb2RlcztcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYWRkZWROb2Rlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBseXJpY3MgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXNpYzogXCJcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhOiBcIlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBcdTUzQzJcdTgwMDNcdTRFRkJcdTUyQTFcdTY4MEZcdTZCNENcdThCQ0RcdTYzRDJcdTRFRjZcdTc2ODRcdTU5MDRcdTc0MDZcdTY1QjlcdTVGMEZcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFkZGVkTm9kZXNbMl0pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx5cmljcy5iYXNpYyA9IGFkZGVkTm9kZXNbMF0uZmlyc3RDaGlsZD8udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx5cmljcy5leHRyYSA9IGFkZGVkTm9kZXNbMl0uZmlyc3RDaGlsZD8udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx5cmljcy5iYXNpYyA9IGFkZGVkTm9kZXNbMF0udGV4dENvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogXHU1M0QxXHU5MDAxXHU2NUIwXHU3Njg0XHU2QjRDXHU4QkNEXHU4ODRDXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1NkI0Q1x1OEJDRFx1NjZGNFx1NjVCMDpgLCBseXJpY3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGxyY0VsZW1lbnRzLCB7XHJcbiAgICAgICAgICAgICAgICBjaGlsZExpc3Q6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBzdWJ0cmVlOiB0cnVlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbGluZSA9IGdldEN1cnJlbnRMeXJpYyhjdXJyZW50THlyaWMpO1xyXG4gICAgICAgIHJldHVybiB7IGxpbmVzOiBbbGluZV0gfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihgWyR7UExVR0lOX05BTUV9XSBcdTgzQjdcdTUzRDZcdThGNkZcdTRFRjZcdTUxODVcdTZCNENcdThCQ0RcdTU5MzFcdThEMjU6YCwgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBcdTUwNUNcdTZCNjJcdTc2RDFcdTU0MkNcdThGNkZcdTRFRjZcdTUxODVcdTZCNENcdThCQ0RcclxuZXhwb3J0IGZ1bmN0aW9uIHN0b3BJbnRlcm5hbEx5cmljcygpIHtcclxuICAgIGlmIChvYnNlcnZlcikge1xyXG4gICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICBvYnNlcnZlciA9IG51bGw7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFx1NTkwNFx1NzQwNlx1NkI0Q1x1OEJDRFx1NjU3MFx1NjM2RVxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc0x5cmljcyhcclxuICAgIHNvbmdJZDogbnVtYmVyLFxyXG4gICAgc291cmNlOiBMeXJpY1NvdXJjZSA9IEx5cmljU291cmNlLlJFRklORURcclxuKTogUHJvbWlzZTxMeXJpY0RhdGE+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgbGV0IGx5cmljRGF0YTogTHlyaWNEYXRhIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgIC8vIFx1ODNCN1x1NTNENlx1NkI0Q1x1OEJDRFxyXG4gICAgICAgIHN3aXRjaCAoc291cmNlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgTHlyaWNTb3VyY2UuUkVGSU5FRDpcclxuICAgICAgICAgICAgICAgIGx5cmljRGF0YSA9IGF3YWl0IGdldFJlZmluZWRMeXJpY3Moc29uZ0lkKTtcclxuICAgICAgICAgICAgICAgIGlmICghbHlyaWNEYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbHlyaWNEYXRhID0gYXdhaXQgZ2V0TGliTHlyaWNMeXJpY3Moc29uZ0lkKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBMeXJpY1NvdXJjZS5MSUJMWVJJQzpcclxuICAgICAgICAgICAgICAgIGx5cmljRGF0YSA9IGF3YWl0IGdldExpYkx5cmljTHlyaWNzKHNvbmdJZCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgTHlyaWNTb3VyY2UuSU5URVJOQUw6XHJcbiAgICAgICAgICAgICAgICBseXJpY0RhdGEgPSBhd2FpdCBnZXRJbnRlcm5hbEx5cmljcygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIWx5cmljRGF0YSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbJHtQTFVHSU5fTkFNRX1dIFx1NjVFMFx1NkNENVx1ODNCN1x1NTNENlx1NkI0Q1x1OEJDRGApO1xyXG4gICAgICAgICAgICByZXR1cm4geyBsaW5lczogW10gfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFx1NkUwNVx1OTY2NFx1N0E3QVx1NzY3RFx1ODg0Q1xyXG4gICAgICAgIGx5cmljRGF0YS5saW5lcyA9IGx5cmljRGF0YS5saW5lcy5maWx0ZXIobGluZSA9PiBsaW5lLm9yaWdpbmFsTHlyaWMudHJpbSgpICE9PSBcIlwiKTtcclxuXHJcbiAgICAgICAgLy8gXHU1OTA0XHU3NDA2XHU3RUFGXHU5N0YzXHU0RTUwXHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBseXJpY0RhdGEubGluZXMubGVuZ3RoID09PSAxICYmXHJcbiAgICAgICAgICAgIGx5cmljRGF0YS5saW5lc1swXS50aW1lID09PSAwICYmXHJcbiAgICAgICAgICAgIGx5cmljRGF0YS5saW5lc1swXS5kdXJhdGlvbiAhPT0gMFxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBsaW5lczogW10gfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBseXJpY0RhdGE7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFske1BMVUdJTl9OQU1FfV0gXHU1OTA0XHU3NDA2XHU2QjRDXHU4QkNEXHU1OTMxXHU4RDI1OmAsIGVycm9yKTtcclxuICAgICAgICByZXR1cm4geyBsaW5lczogW10gfTtcclxuICAgIH1cclxufSIsICJpbXBvcnQgeyBCYXNlTWVzc2FnZSwgTHlyaWNEYXRhLCBMeXJpY01lc3NhZ2UsIE1lc3NhZ2VUeXBlLCBQbGF5U3RhdGVNZXNzYWdlLCBQTFVHSU5fTkFNRSwgUHJvZ3Jlc3NNZXNzYWdlLCBTb25nSW5mbywgU29uZ01lc3NhZ2UgfSBmcm9tIFwiLi9jb25zdFwiO1xuXG5leHBvcnQgY2xhc3MgTHlyaWNDbGllbnQge1xuICAgIHByaXZhdGUgcG9ydDogbnVtYmVyO1xuICAgIHByaXZhdGUgaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IHJlY29ubmVjdFRpbWVvdXQgPSAzMDAwOyAvLyBcdTkxQ0RcdThGREVcdTk1RjRcdTk2OTRcbiAgICBwcml2YXRlIGNoZWNrVGltZXI/OiBudW1iZXI7ICAvLyBcdTY1MzlcdTc1MjggbnVtYmVyIFx1N0M3Qlx1NTc4QlxuICAgIHByaXZhdGUgaXNSZWNvbm5lY3RpbmcgPSBmYWxzZTsgIC8vIFx1NkRGQlx1NTJBMFx1OTFDRFx1OEZERVx1NzJCNlx1NjAwMVx1NjgwN1x1OEJCMFxuICAgIHByaXZhdGUgbGFzdFJlY29ubmVjdFRpbWUgPSAwOyAgIC8vIFx1OEJCMFx1NUY1NVx1NEUwQVx1NkIyMVx1OTFDRFx1OEZERVx1NjVGNlx1OTVGNFxuICAgIHByaXZhdGUgcmVhZG9ubHkgbWluUmVjb25uZWN0SW50ZXJ2YWwgPSAxMDAwOyAgLy8gXHU2NzAwXHU1QzBGXHU5MUNEXHU4RkRFXHU5NUY0XHU5Njk0XHVGRjA4XHU2QkVCXHU3OUQyXHVGRjA5XG5cbiAgICBjb25zdHJ1Y3Rvcihwb3J0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5wb3J0ID0gcG9ydDtcbiAgICAgICAgdm9pZCB0aGlzLnN0YXJ0Q29ubmVjdGlvbkNoZWNrKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBzdGFydENvbm5lY3Rpb25DaGVjaygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgLy8gXHU2RTA1XHU3NDA2XHU2NUU3XHU3Njg0XHU1QjlBXHU2NUY2XHU1NjY4XG4gICAgICAgIGlmICh0aGlzLmNoZWNrVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5jaGVja1RpbWVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFx1NTQyRlx1NTJBOFx1NjVCMFx1NzY4NFx1NUI5QVx1NjVGNlx1NjhDMFx1NjdFNVxuICAgICAgICB0aGlzLmNoZWNrVGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB2b2lkIHRoaXMuY2hlY2tDb25uZWN0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRoaXMucmVjb25uZWN0VGltZW91dCk7XG5cbiAgICAgICAgLy8gXHU3QUNCXHU1MzczXHU2OEMwXHU2N0U1XHU0RTAwXHU2QjIxXG4gICAgICAgIHZvaWQgdGhpcy5jaGVja0Nvbm5lY3Rpb24oKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGNoZWNrQ29ubmVjdGlvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgICAgLy8gXHU2OEMwXHU2N0U1XHU2NjJGXHU1NDI2XHU2QjYzXHU1NzI4XHU5MUNEXHU4RkRFXG4gICAgICAgIGlmICh0aGlzLmlzUmVjb25uZWN0aW5nKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgLy8gXHU2OEMwXHU2N0U1XHU5MUNEXHU4RkRFXHU5NUY0XHU5Njk0XG4gICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICAgIGlmIChub3cgLSB0aGlzLmxhc3RSZWNvbm5lY3RUaW1lIDwgdGhpcy5taW5SZWNvbm5lY3RJbnRlcnZhbCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuaXNSZWNvbm5lY3RpbmcgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5sYXN0UmVjb25uZWN0VGltZSA9IG5vdztcblxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgaHR0cDovLzEyNy4wLjAuMToke3RoaXMucG9ydH0vcGluZ2AsIHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdHRVQnXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1NjcwRFx1NTJBMVx1NTY2OFx1NURGMlx1OEZERVx1NjNBNWApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmlzQ29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gXHU0RjdGXHU3NTI4IFByb21pc2UucmVzb2x2ZSgpLnRoZW4gXHU2NzY1XHU3ODZFXHU0RkREXHU1RjAyXHU2QjY1XHU2MjY3XHU4ODRDXG4gICAgICAgICAgICAgICAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gdGhpcy5vbkNvbm5lY3Rpb25SZXN0b3JlZCgpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gXHU1M0VBXHU1NzI4XHU3MkI2XHU2MDAxXHU1M0Q4XHU1MzE2XHU2NUY2XHU2MjUzXHU1MzcwXHU0RTAwXHU2QjIxXHU2NUU1XHU1RkQ3XG4gICAgICAgICAgICBpZiAodGhpcy5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1N0I0OVx1NUY4NVx1NjcwRFx1NTJBMVx1NTY2OFx1OEZERVx1NjNBNS4uLmApO1xuICAgICAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMuaXNSZWNvbm5lY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gXHU4RkRFXHU2M0E1XHU2MDYyXHU1OTBEXHU2NUY2XHU3Njg0XHU1OTA0XHU3NDA2XG4gICAgcHJpdmF0ZSBhc3luYyBvbkNvbm5lY3Rpb25SZXN0b3JlZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgLy8gXHU3ODZFXHU0RkREXHU1NkRFXHU4QzAzXHU1QjU4XHU1NzI4XHU0RTE0XHU4RkRFXHU2M0E1XHU3MkI2XHU2MDAxXHU2QjYzXHU3ODZFXG4gICAgICAgIGlmICh0aGlzLm9uUmVjb25uZWN0ICYmIHRoaXMuaXNDb25uZWN0ZWQgJiYgIXRoaXMuaXNSZWNvbm5lY3RpbmcpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMub25SZWNvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFx1OTFDRFx1OEZERVx1NTZERVx1OEMwM1xuICAgIHB1YmxpYyBvblJlY29ubmVjdD86ICgpID0+IFByb21pc2U8dm9pZD47XG5cbiAgICBwcml2YXRlIGFzeW5jIHNlbmRSZXF1ZXN0PFQgZXh0ZW5kcyBCYXNlTWVzc2FnZT4oZGF0YTogVCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICAvLyBcdTU5ODJcdTY3OUNcdTY3MkFcdThGREVcdTYzQTVcdUZGMENcdTUxNDhcdTVDMURcdThCRDVcdTkxQ0RcdThGREVcbiAgICAgICAgaWYgKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICBjb25zdCBjb25uZWN0ZWQgPSBhd2FpdCB0aGlzLmNoZWNrQ29ubmVjdGlvbigpO1xuICAgICAgICAgICAgaWYgKCFjb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgWyR7UExVR0lOX05BTUV9XSBcdTY3MERcdTUyQTFcdTU2NjhcdTY3MkFcdThGREVcdTYzQTVgKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkYXRhLnRpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1NTNEMVx1OTAwMVx1OEJGN1x1NkM0MjogJHtkYXRhLnR5cGV9LCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGRhdGEuZGF0YSkuc3Vic3RyaW5nKDAsIDEwMCl9YCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLnBvcnR9YCwge1xuICAgICAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoZGF0YSksXG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgWyR7UExVR0lOX05BTUV9XSBcdTUzRDFcdTkwMDFcdThCRjdcdTZDNDJcdTU5MzFcdThEMjU6YCwgZXJyb3JNZXNzYWdlKTtcbiAgICAgICAgICAgIHRoaXMuaXNDb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIFx1NEUwRFx1ODk4MVx1NTcyOFx1OEZEOVx1OTFDQ1x1NTE4RFx1NkIyMVx1OEMwM1x1NzUyOCBjaGVja0Nvbm5lY3Rpb25cdUZGMENcdTkwN0ZcdTUxNERcdTVGQUFcdTczQUZcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFx1NTNEMVx1OTAwMVx1OTUxOVx1OEJFRlx1NkQ4OFx1NjA2RlxuICAgIC8vIHByaXZhdGUgYXN5bmMgc2VuZEVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vICAgICBjb25zb2xlLmVycm9yKGBbJHtQTFVHSU5fTkFNRX1dICR7bWVzc2FnZX1gKTtcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICAgIGF3YWl0IGZldGNoKGBodHRwOi8vMTI3LjAuMC4xOiR7dGhpcy5wb3J0fWAsIHtcbiAgICAvLyAgICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIC8vICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAvLyAgICAgICAgICAgICAgICAgdHlwZTogTWVzc2FnZVR5cGUuRVJST1IsXG4gICAgLy8gICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAvLyAgICAgICAgICAgICAgICAgZGF0YTogeyBtZXNzYWdlIH1cbiAgICAvLyAgICAgICAgICAgICB9IHNhdGlzZmllcyBFcnJvck1lc3NhZ2UpLFxuICAgIC8vICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAvLyAgICAgICAgICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCJcbiAgICAvLyAgICAgICAgICAgICB9XG4gICAgLy8gICAgICAgICB9KTtcbiAgICAvLyAgICAgfSBjYXRjaCB7XG4gICAgLy8gICAgICAgICAvLyBcdTVGRkRcdTc1NjVcdTUzRDFcdTkwMDFcdTk1MTlcdThCRUZcdTZEODhcdTYwNkZcdTY1RjZcdTc2ODRcdTk1MTlcdThCRUZcbiAgICAvLyAgICAgfVxuICAgIC8vIH1cblxuICAgIC8vIFx1NTNEMVx1OTAwMVx1NkI0Q1x1OEJDRFxuICAgIGFzeW5jIHNlbmRMeXJpYyhseXJpY3M6IEx5cmljRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0PEx5cmljTWVzc2FnZT4oe1xuICAgICAgICAgICAgdHlwZTogTWVzc2FnZVR5cGUuTFlSSUMsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IDAsXG4gICAgICAgICAgICBkYXRhOiBseXJpY3NcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gXHU1M0QxXHU5MDAxXHU2QjRDXHU2NkYyXHU0RkUxXHU2MDZGXG4gICAgYXN5bmMgc2VuZFNvbmdJbmZvKGluZm86IFNvbmdJbmZvKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2VuZFJlcXVlc3Q8U29uZ01lc3NhZ2U+KHtcbiAgICAgICAgICAgIHR5cGU6IE1lc3NhZ2VUeXBlLlNPTkdfQ0hBTkdFLFxuICAgICAgICAgICAgdGltZXN0YW1wOiAwLFxuICAgICAgICAgICAgZGF0YTogaW5mb1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBcdTUzRDFcdTkwMDFcdTY0QURcdTY1M0VcdThGREJcdTVFQTZcbiAgICBhc3luYyBzZW5kUHJvZ3Jlc3ModGltZTogbnVtYmVyLCBkdXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2VuZFJlcXVlc3Q8UHJvZ3Jlc3NNZXNzYWdlPih7XG4gICAgICAgICAgICB0eXBlOiBNZXNzYWdlVHlwZS5QUk9HUkVTUyxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogMCxcbiAgICAgICAgICAgIGRhdGE6IHsgdGltZSwgZHVyYXRpb24gfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBcdTUzRDFcdTkwMDFcdTY0QURcdTY1M0VcdTcyQjZcdTYwMDFcbiAgICBhc3luYyBzZW5kUGxheVN0YXRlKHN0YXRlOiAncmVzdW1lJyB8ICdwYXVzZScpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zZW5kUmVxdWVzdDxQbGF5U3RhdGVNZXNzYWdlPih7XG4gICAgICAgICAgICB0eXBlOiBNZXNzYWdlVHlwZS5QTEFZX1NUQVRFLFxuICAgICAgICAgICAgdGltZXN0YW1wOiAwLFxuICAgICAgICAgICAgZGF0YTogeyBzdGF0ZSB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFx1NjZGNFx1NjVCMFx1N0FFRlx1NTNFM1xuICAgIGFzeW5jIHVwZGF0ZVBvcnQobmV3UG9ydDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIC8vIDEuIFx1NkUwNVx1NzQwNlx1NjVFN1x1NzY4NFx1OEQ0NFx1NkU5MFxuICAgICAgICB0aGlzLmRpc3Bvc2UoKTtcblxuICAgICAgICAvLyAyLiBcdTY2RjRcdTY1QjBcdTdBRUZcdTUzRTNcbiAgICAgICAgdGhpcy5wb3J0ID0gbmV3UG9ydDtcblxuICAgICAgICAvLyAzLiBcdTkxQ0RcdTY1QjBcdTUyMURcdTU5Q0JcdTUzMTZcbiAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgICAgICBhd2FpdCB0aGlzLnN0YXJ0Q29ubmVjdGlvbkNoZWNrKCk7XG5cbiAgICAgICAgLy8gNC4gXHU5MUNEXHU2NUIwXHU1M0QxXHU5MDAxXHU1RjUzXHU1MjREXHU2NTcwXHU2MzZFXG4gICAgICAgIGlmICh0aGlzLm9uUmVjb25uZWN0KSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLm9uUmVjb25uZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBcdTZFMDVcdTc0MDZcdThENDRcdTZFOTBcbiAgICBkaXNwb3NlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5jaGVja1RpbWVyKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuY2hlY2tUaW1lcik7XG4gICAgICAgICAgICB0aGlzLmNoZWNrVGltZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuICAgIH1cbn0gIiwgImltcG9ydCB7IE1vbml0b3JTdGF0ZSB9IGZyb20gJy4uL2NvbnN0JztcclxuXHJcbnR5cGUgTGlzdGVuZXI8VD4gPSAoZGF0YTogVCkgPT4gdm9pZDtcclxuXHJcbmNsYXNzIEV2ZW50RW1pdHRlcjxUPiB7XHJcbiAgICBwcml2YXRlIGxpc3RlbmVyczogTGlzdGVuZXI8VD5bXSA9IFtdO1xyXG5cclxuICAgIHN1YnNjcmliZShsaXN0ZW5lcjogTGlzdGVuZXI8VD4pIHtcclxuICAgICAgICB0aGlzLmxpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuICAgICAgICByZXR1cm4gKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzLmZpbHRlcihsID0+IGwgIT09IGxpc3RlbmVyKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGVtaXQoZGF0YTogVCkge1xyXG4gICAgICAgIHRoaXMubGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4gbGlzdGVuZXIoZGF0YSkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgbW9uaXRvckV2ZW50cyA9IG5ldyBFdmVudEVtaXR0ZXI8TW9uaXRvclN0YXRlPigpOyAiLCAiaW1wb3J0IHsgTW9uaXRvclN0YXRlIH0gZnJvbSAnLi4vY29uc3QnO1xyXG5pbXBvcnQgeyBtb25pdG9yRXZlbnRzIH0gZnJvbSAnLi4vdXRpbHMvZXZlbnRzJztcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBNb25pdG9yKCkge1xyXG4gICAgY29uc3QgW3N0YXRlLCBzZXRTdGF0ZV0gPSBSZWFjdC51c2VTdGF0ZTxNb25pdG9yU3RhdGU+KHt9KTtcclxuXHJcbiAgICBSZWFjdC51c2VFZmZlY3QoKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHVuc3Vic2NyaWJlID0gbW9uaXRvckV2ZW50cy5zdWJzY3JpYmUobmV3U3RhdGUgPT4ge1xyXG4gICAgICAgICAgICBzZXRTdGF0ZShwcmV2ID0+ICh7IC4uLnByZXYsIC4uLm5ld1N0YXRlIH0pKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gKCkgPT4gdW5zdWJzY3JpYmUoKTtcclxuICAgIH0sIFtdKTtcclxuXHJcbiAgICBjb25zdCBzdHlsZXMgPSB7XHJcbiAgICAgICAgY29udGFpbmVyOiB7XHJcbiAgICAgICAgICAgIHBhZGRpbmc6ICcyNHB4JyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnI2ZmZicsXHJcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzE2cHgnLFxyXG4gICAgICAgICAgICBib3hTaGFkb3c6ICcwIDRweCAyMHB4IHJnYmEoMCwwLDAsMC4wNSknLFxyXG4gICAgICAgICAgICBtYXhXaWR0aDogJzkwMHB4JyxcclxuICAgICAgICAgICAgbWFyZ2luOiAnMjBweCBhdXRvJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGl0bGU6IHtcclxuICAgICAgICAgICAgZm9udFNpemU6ICcyMHB4JyxcclxuICAgICAgICAgICAgZm9udFdlaWdodDogJ2JvbGQnLFxyXG4gICAgICAgICAgICBjb2xvcjogJyNmZjg1YTInLCAgLy8gXHU3Qzg5XHU4MjcyXHU2ODA3XHU5ODk4XHJcbiAgICAgICAgICAgIG1hcmdpbkJvdHRvbTogJzI0cHgnLFxyXG4gICAgICAgICAgICBwYWRkaW5nQm90dG9tOiAnMTJweCcsXHJcbiAgICAgICAgICAgIGJvcmRlckJvdHRvbTogJzJweCBzb2xpZCAjZmZkNmUwJyAgLy8gXHU2RDQ1XHU3Qzg5XHU4MjcyXHU4RkI5XHU2ODQ2XHJcbiAgICAgICAgfSxcclxuICAgICAgICBncmlkOiB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdncmlkJyxcclxuICAgICAgICAgICAgZ2FwOiAnMjRweCcsXHJcbiAgICAgICAgICAgIGdyaWRUZW1wbGF0ZUNvbHVtbnM6ICdyZXBlYXQoYXV0by1maXQsIG1pbm1heCgzMDBweCwgMWZyKSknICAvLyBcdTgxRUFcdTkwMDJcdTVFOTRcdTUyMTdcdTY1NzBcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNlY3Rpb246IHtcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnI2ZmZjlmYScsICAvLyBcdThEODVcdTZENDVcdTdDODlcdTgyNzJcdTgwQ0NcdTY2NkZcclxuICAgICAgICAgICAgcGFkZGluZzogJzIwcHgnLFxyXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcclxuICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNmZmU0ZTgnLCAgLy8gXHU2RDQ1XHU3Qzg5XHU4MjcyXHU4RkI5XHU2ODQ2XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0gMC4ycyBlYXNlJyxcclxuICAgICAgICAgICAgJzpob3Zlcic6IHtcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoLTJweCknXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIHNlY3Rpb25UaXRsZToge1xyXG4gICAgICAgICAgICBmb250U2l6ZTogJzE2cHgnLFxyXG4gICAgICAgICAgICBmb250V2VpZ2h0OiAnYm9sZCcsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnI2ZmODVhMicsICAvLyBcdTdDODlcdTgyNzJcdTY4MDdcdTk4OThcclxuICAgICAgICAgICAgbWFyZ2luQm90dG9tOiAnMTZweCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbnRlbnQ6IHtcclxuICAgICAgICAgICAgY29sb3I6ICcjNGE0YTRhJyxcclxuICAgICAgICAgICAgbGluZUhlaWdodDogJzEuOCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIHByb2dyZXNzQmFyOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiAnMTAwJScsXHJcbiAgICAgICAgICAgIGhlaWdodDogJzZweCcsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJyNmZmU0ZTgnLCAgLy8gXHU2RDQ1XHU3Qzg5XHU4MjcyXHU4MENDXHU2NjZGXHJcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzRweCcsXHJcbiAgICAgICAgICAgIG92ZXJmbG93OiAnaGlkZGVuJyxcclxuICAgICAgICAgICAgbWFyZ2luQm90dG9tOiAnMTJweCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIHByb2dyZXNzRmlsbDogKHBlcmNlbnQ6IG51bWJlcikgPT4gKHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke3BlcmNlbnR9JWAsXHJcbiAgICAgICAgICAgIGhlaWdodDogJzEwMCUnLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICcjZmY4NWEyJywgIC8vIFx1N0M4OVx1ODI3Mlx1OEZEQlx1NUVBNlx1Njc2MVxyXG4gICAgICAgICAgICB0cmFuc2l0aW9uOiAnd2lkdGggMC4zcyBlYXNlJ1xyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIGxhYmVsOiB7XHJcbiAgICAgICAgICAgIGNvbG9yOiAnIzg4OCcsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMTRweCcsXHJcbiAgICAgICAgICAgIG1pbldpZHRoOiAnNjBweCcsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtYmxvY2snXHJcbiAgICAgICAgfSxcclxuICAgICAgICB2YWx1ZToge1xyXG4gICAgICAgICAgICBjb2xvcjogJyM0YTRhNGEnLFxyXG4gICAgICAgICAgICBtYXJnaW5MZWZ0OiAnMTJweCcsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMTRweCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGx5cmljTGluZTogKGlzQWN0aXZlOiBib29sZWFuKSA9PiAoe1xyXG4gICAgICAgICAgICBwYWRkaW5nOiAnNnB4IDAnLFxyXG4gICAgICAgICAgICBjb2xvcjogaXNBY3RpdmUgPyAnI2ZmODVhMicgOiAnIzY2NicsICAvLyBcdTdDODlcdTgyNzJcdTlBRDhcdTRFQUVcclxuICAgICAgICAgICAgdHJhbnNpdGlvbjogJ2FsbCAwLjNzIGVhc2UnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzE0cHgnLFxyXG4gICAgICAgICAgICBmb250V2VpZ2h0OiBpc0FjdGl2ZSA/ICc1MDAnIDogJ25vcm1hbCdcclxuICAgICAgICB9KSxcclxuICAgICAgICBwbGF5U3RhdGU6IHtcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxyXG4gICAgICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzE2cHgnLFxyXG4gICAgICAgICAgICBjb2xvcjogJyNmZjg1YTInICAvLyBcdTdDODlcdTgyNzJcdTcyQjZcdTYwMDFcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiAoXHJcbiAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLmNvbnRhaW5lcn0+XHJcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy50aXRsZX0+XHU2NEFEXHU2NTNFXHU3MkI2XHU2MDAxXHU3NkQxXHU4OUM2XHU1NjY4PC9kaXY+XHJcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5ncmlkfT5cclxuICAgICAgICAgICAgICAgIHsvKiBcdTZCNENcdTY2RjJcdTRGRTFcdTYwNkYgKi99XHJcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvbn0+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLnNlY3Rpb25UaXRsZX0+XHU2QjRDXHU2NkYyXHU0RkUxXHU2MDZGPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAge3N0YXRlLnNvbmcgPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5jb250ZW50fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+PHNwYW4gc3R5bGU9e3N0eWxlcy5sYWJlbH0+XHU2ODA3XHU5ODk4Ojwvc3Bhbj48c3BhbiBzdHlsZT17c3R5bGVzLnZhbHVlfT57c3RhdGUuc29uZy5uYW1lfTwvc3Bhbj48L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+PHNwYW4gc3R5bGU9e3N0eWxlcy5sYWJlbH0+XHU2QjRDXHU2MjRCOjwvc3Bhbj48c3BhbiBzdHlsZT17c3R5bGVzLnZhbHVlfT57c3RhdGUuc29uZy5hcnRpc3RzLm1hcChhID0+IGEubmFtZSkuam9pbignIC8gJyl9PC9zcGFuPjwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj48c3BhbiBzdHlsZT17c3R5bGVzLmxhYmVsfT5cdTRFMTNcdThGOTE6PC9zcGFuPjxzcGFuIHN0eWxlPXtzdHlsZXMudmFsdWV9PntzdGF0ZS5zb25nLmFsYnVtLm5hbWV9PC9zcGFuPjwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge3N0YXRlLnNvbmcuYWxpYXMubGVuZ3RoID4gMCAmJiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj48c3BhbiBzdHlsZT17c3R5bGVzLmxhYmVsfT5cdTUyMkJcdTU0MEQ6PC9zcGFuPjxzcGFuIHN0eWxlPXtzdHlsZXMudmFsdWV9PntzdGF0ZS5zb25nLmFsaWFzLmpvaW4oJyAvICcpfTwvc3Bhbj48L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICl9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICkgOiA8ZGl2IHN0eWxlPXtzdHlsZXMuY29udGVudH0+XHU2NUUwXHU2NEFEXHU2NTNFXHU0RkUxXHU2MDZGPC9kaXY+fVxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgey8qIFx1NjRBRFx1NjUzRVx1OEZEQlx1NUVBNiAqL31cclxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5zZWN0aW9ufT5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvblRpdGxlfT5cdTY0QURcdTY1M0VcdThGREJcdTVFQTY8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICB7c3RhdGUucHJvZ3Jlc3MgPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5jb250ZW50fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5wcm9ncmVzc0Jhcn0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLnByb2dyZXNzRmlsbCgoc3RhdGUucHJvZ3Jlc3MudGltZSAvIHN0YXRlLnByb2dyZXNzLmR1cmF0aW9uKSAqIDEwMCl9IC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAnOHB4JywgZGlzcGxheTogJ2ZsZXgnLCBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nIH19PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPntNYXRoLmZsb29yKHN0YXRlLnByb2dyZXNzLnRpbWUgLyAxMDAwKX1zPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPntNYXRoLmZsb29yKHN0YXRlLnByb2dyZXNzLmR1cmF0aW9uIC8gMTAwMCl9czwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICApIDogPGRpdiBzdHlsZT17c3R5bGVzLmNvbnRlbnR9Plx1NjcyQVx1NjRBRFx1NjUzRTwvZGl2Pn1cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgIHsvKiBcdTZCNENcdThCQ0RcdTY2M0VcdTc5M0EgKi99XHJcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvbn0+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLnNlY3Rpb25UaXRsZX0+XHU2QjRDXHU4QkNEPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLmNvbnRlbnR9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7c3RhdGUubHlyaWNzPy5saW5lcy5tYXAoKGxpbmUsIGluZGV4KSA9PiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5PXtpbmRleH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT17c3R5bGVzLmx5cmljTGluZShsaW5lLnRpbWUgPD0gKHN0YXRlLnByb2dyZXNzPy50aW1lIHx8IDApICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChsaW5lLnRpbWUgKyAobGluZS5kdXJhdGlvbiB8fCAwKSkgPj0gKHN0YXRlLnByb2dyZXNzPy50aW1lIHx8IDApKX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7bGluZS5vcmlnaW5hbEx5cmljfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICkpIHx8ICdcdTY1RTBcdTZCNENcdThCQ0QnfVxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgey8qIFx1NjRBRFx1NjUzRVx1NzJCNlx1NjAwMSAqL31cclxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5zZWN0aW9ufT5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvblRpdGxlfT5cdTY0QURcdTY1M0VcdTcyQjZcdTYwMDE8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuY29udGVudH0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5wbGF5U3RhdGV9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge3N0YXRlLnBsYXlTdGF0ZSA9PT0gJ3Jlc3VtZScgPyAnXHUyNUI2IFx1NjRBRFx1NjUzRVx1NEUyRCcgOiAnXHUyM0Y4IFx1NURGMlx1NjY4Mlx1NTA1Qyd9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgKTtcclxufSAiLCAiaW1wb3J0IHtcclxuICAgIERFRkFVTFRfUE9SVCxcclxuICAgIENPTkZJR19LRVlTLFxyXG4gICAgTHlyaWNTb3VyY2UsXHJcbiAgICBTT1VSQ0VfTkFNRVMsXHJcbn0gZnJvbSBcIi4uL2NvbnN0XCI7XHJcbmltcG9ydCB7IE1vbml0b3IgfSBmcm9tICcuL21vbml0b3InO1xyXG5cclxuaW50ZXJmYWNlIENvbmZpZ1Byb3BzIHtcclxuICAgIG9uU2F2ZTogKHBvcnQ6IG51bWJlcikgPT4gUHJvbWlzZTx2b2lkPjtcclxuICAgIG9uTHlyaWNTb3VyY2VDaGFuZ2U6IChzb3VyY2U6IEx5cmljU291cmNlKSA9PiBQcm9taXNlPHZvaWQ+O1xyXG4gICAgZGVmYXVsdFBvcnQ6IG51bWJlcjtcclxuICAgIGRlZmF1bHRMeXJpY1NvdXJjZTogTHlyaWNTb3VyY2U7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBDb25maWcoeyBvblNhdmUsIG9uTHlyaWNTb3VyY2VDaGFuZ2UsIGRlZmF1bHRQb3J0LCBkZWZhdWx0THlyaWNTb3VyY2UgfTogQ29uZmlnUHJvcHMpIHtcclxuICAgIGNvbnN0IFtwb3J0LCBzZXRQb3J0XSA9IFJlYWN0LnVzZVN0YXRlKGRlZmF1bHRQb3J0KTtcclxuICAgIGNvbnN0IFtseXJpY1NvdXJjZSwgc2V0THlyaWNTb3VyY2VdID0gUmVhY3QudXNlU3RhdGUoZGVmYXVsdEx5cmljU291cmNlKTtcclxuICAgIGNvbnN0IFtzaG93U3VjY2Vzcywgc2V0U2hvd1N1Y2Nlc3NdID0gUmVhY3QudXNlU3RhdGUoZmFsc2UpO1xyXG5cclxuICAgIFJlYWN0LnVzZUVmZmVjdCgoKSA9PiB7XHJcbiAgICAgICAgLy8gXHU4QkZCXHU1M0Q2XHU3QUVGXHU1M0UzXHU5MTREXHU3RjZFXHJcbiAgICAgICAgYmV0dGVybmNtLmFwcC5yZWFkQ29uZmlnKENPTkZJR19LRVlTLlBPUlQsIGRlZmF1bHRQb3J0LnRvU3RyaW5nKCkpXHJcbiAgICAgICAgICAgIC50aGVuKHNhdmVkUG9ydCA9PiB7XHJcbiAgICAgICAgICAgICAgICBzZXRQb3J0KE51bWJlcihzYXZlZFBvcnQpKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFx1OEJGQlx1NTNENlx1NkI0Q1x1OEJDRFx1Njc2NVx1NkU5MFx1OTE0RFx1N0Y2RVxyXG4gICAgICAgIGJldHRlcm5jbS5hcHAucmVhZENvbmZpZyhDT05GSUdfS0VZUy5MWVJJQ19TT1VSQ0UsIGRlZmF1bHRMeXJpY1NvdXJjZS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAudGhlbihzYXZlZFNvdXJjZSA9PiB7XHJcbiAgICAgICAgICAgICAgICBzZXRMeXJpY1NvdXJjZShOdW1iZXIoc2F2ZWRTb3VyY2UpKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9LCBbZGVmYXVsdFBvcnQsIGRlZmF1bHRMeXJpY1NvdXJjZV0pO1xyXG5cclxuICAgIGNvbnN0IGhhbmRsZVBvcnRDaGFuZ2UgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcG9ydE51bSA9IE51bWJlcihwb3J0KTtcclxuICAgICAgICBpZiAoIWlzTmFOKHBvcnROdW0pICYmIHBvcnROdW0gPj0gMSAmJiBwb3J0TnVtIDw9IDY1NTM1KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IG9uU2F2ZShwb3J0TnVtKTtcclxuICAgICAgICAgICAgYXdhaXQgb25MeXJpY1NvdXJjZUNoYW5nZShseXJpY1NvdXJjZSk7XHJcbiAgICAgICAgICAgIHNldFNob3dTdWNjZXNzKHRydWUpO1xyXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHNldFNob3dTdWNjZXNzKGZhbHNlKSwgMjAwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBoYW5kbGVTb3VyY2VDaGFuZ2UgPSBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgICBjb25zdCBuZXdTb3VyY2UgPSBOdW1iZXIoZXZlbnQudGFyZ2V0LnZhbHVlKSBhcyBMeXJpY1NvdXJjZTtcclxuICAgICAgICBzZXRMeXJpY1NvdXJjZShuZXdTb3VyY2UpO1xyXG4gICAgICAgIGF3YWl0IG9uTHlyaWNTb3VyY2VDaGFuZ2UobmV3U291cmNlKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3Qgc3R5bGVzID0ge1xyXG4gICAgICAgIGNvbnRhaW5lcjoge1xyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMjRweCcsXHJcbiAgICAgICAgICAgIG1heFdpZHRoOiAnOTAwcHgnLFxyXG4gICAgICAgICAgICBtYXJnaW46ICcyMHB4IGF1dG8nLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICcjZmZmJyxcclxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMTZweCcsXHJcbiAgICAgICAgICAgIGJveFNoYWRvdzogJzAgNHB4IDIwcHggcmdiYSgwLDAsMCwwLjA1KSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIHRpdGxlOiB7XHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMjBweCcsXHJcbiAgICAgICAgICAgIGZvbnRXZWlnaHQ6ICdib2xkJyxcclxuICAgICAgICAgICAgY29sb3I6ICcjZmY4NWEyJyxcclxuICAgICAgICAgICAgbWFyZ2luQm90dG9tOiAnMjRweCcsXHJcbiAgICAgICAgICAgIHBhZGRpbmdCb3R0b206ICcxMnB4JyxcclxuICAgICAgICAgICAgYm9yZGVyQm90dG9tOiAnMnB4IHNvbGlkICNmZmQ2ZTAnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZWN0aW9uOiB7XHJcbiAgICAgICAgICAgIG1hcmdpbkJvdHRvbTogJzI0cHgnLFxyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMjBweCcsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJyNmZmY5ZmEnLFxyXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICcxMnB4JyxcclxuICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNmZmU0ZTgnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZWN0aW9uVGl0bGU6IHtcclxuICAgICAgICAgICAgZm9udFNpemU6ICcxNnB4JyxcclxuICAgICAgICAgICAgZm9udFdlaWdodDogJ2JvbGQnLFxyXG4gICAgICAgICAgICBjb2xvcjogJyNmZjg1YTInLFxyXG4gICAgICAgICAgICBtYXJnaW5Cb3R0b206ICcxNnB4J1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbGFiZWw6IHtcclxuICAgICAgICAgICAgZGlzcGxheTogJ2Jsb2NrJyxcclxuICAgICAgICAgICAgY29sb3I6ICcjNjY2JyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICcxNHB4J1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaW5wdXRHcm91cDoge1xyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsXHJcbiAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBnYXA6ICcxNnB4J1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaW5wdXQ6IHtcclxuICAgICAgICAgICAgcGFkZGluZzogJzEwcHggMTZweCcsXHJcbiAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCAjZmZkNmUwJyxcclxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOHB4JyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICcxNHB4JyxcclxuICAgICAgICAgICAgd2lkdGg6ICcxNDBweCcsXHJcbiAgICAgICAgICAgIHRyYW5zaXRpb246ICdhbGwgMC4zcycsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJyNmZmYnLFxyXG4gICAgICAgICAgICBjb2xvcjogJyMzMzMnLFxyXG4gICAgICAgICAgICAnOmZvY3VzJzoge1xyXG4gICAgICAgICAgICAgICAgYm9yZGVyQ29sb3I6ICcjZmY4NWEyJyxcclxuICAgICAgICAgICAgICAgIGJveFNoYWRvdzogJzAgMCAwIDNweCByZ2JhKDI1NSwxMzMsMTYyLDAuMSknLFxyXG4gICAgICAgICAgICAgICAgb3V0bGluZTogJ25vbmUnXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIHNlbGVjdDoge1xyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMTBweCAxNnB4JyxcclxuICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNmZmQ2ZTAnLFxyXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc4cHgnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzE0cHgnLFxyXG4gICAgICAgICAgICB3aWR0aDogJzIyMHB4JyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnI2ZmZicsXHJcbiAgICAgICAgICAgIGN1cnNvcjogJ3BvaW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJyMzMzMnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBvcHRpb246IHtcclxuICAgICAgICAgICAgY29sb3I6ICcjMzMzJyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnI2ZmZidcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJ1dHRvbjoge1xyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMTBweCAyNHB4JyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnI2ZmODVhMicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXHJcbiAgICAgICAgICAgIGJvcmRlcjogJ25vbmUnLFxyXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc4cHgnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzE0cHgnLFxyXG4gICAgICAgICAgICBjdXJzb3I6ICdwb2ludGVyJyxcclxuICAgICAgICAgICAgdHJhbnNpdGlvbjogJ2FsbCAwLjNzJyxcclxuICAgICAgICAgICAgJzpob3Zlcic6IHtcclxuICAgICAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJyNmZjlkYjUnXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIHRvYXN0OiB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnIGFzIGNvbnN0LFxyXG4gICAgICAgICAgICBib3R0b206ICcyNHB4JyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVgoLTUwJSknLFxyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMTJweCAyNHB4JyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgyNTUsMTMzLDE2MiwwLjkpJyxcclxuICAgICAgICAgICAgY29sb3I6ICcjZmZmJyxcclxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOHB4JyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICcxNHB4JyxcclxuICAgICAgICAgICAgYm94U2hhZG93OiAnMCA0cHggMTJweCByZ2JhKDI1NSwxMzMsMTYyLDAuMiknLFxyXG4gICAgICAgICAgICBhbmltYXRpb246ICdmYWRlSW4gMC4zcydcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiAoXHJcbiAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLmNvbnRhaW5lcn0+XHJcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy50aXRsZX0+XHU2M0QyXHU0RUY2XHU5MTREXHU3RjZFPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvbn0+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtzdHlsZXMuc2VjdGlvblRpdGxlfT5cdTY3MERcdTUyQTFcdTdBRUZcdTUzRTM8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3N0eWxlcy5pbnB1dEdyb3VwfT5cclxuICAgICAgICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZT1cIm51bWJlclwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXtwb3J0fVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17ZSA9PiBzZXRQb3J0KE51bWJlcihlLnRhcmdldC52YWx1ZSkpfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT17c3R5bGVzLmlucHV0fVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtaW49XCIxXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4PVwiNjU1MzVcIlxyXG4gICAgICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVQb3J0Q2hhbmdlfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT17c3R5bGVzLmJ1dHRvbn1cclxuICAgICAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFx1NEZERFx1NUI1OFxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLnNlY3Rpb259PlxyXG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17c3R5bGVzLnNlY3Rpb25UaXRsZX0+XHU2QjRDXHU4QkNEXHU2NzY1XHU2RTkwPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8c2VsZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2x5cmljU291cmNlfVxyXG4gICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtoYW5kbGVTb3VyY2VDaGFuZ2V9XHJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3N0eWxlcy5zZWxlY3R9XHJcbiAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAge09iamVjdC5lbnRyaWVzKFNPVVJDRV9OQU1FUykubWFwKChbdmFsdWUsIG5hbWVdKSA9PiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24ga2V5PXt2YWx1ZX0gdmFsdWU9e3ZhbHVlfSBzdHlsZT17c3R5bGVzLm9wdGlvbn0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7bmFtZX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgKSl9XHJcbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8TW9uaXRvciAvPlxyXG5cclxuICAgICAgICAgICAge3Nob3dTdWNjZXNzICYmIChcclxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3tcclxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICAgICAgICBib3R0b206ICcyNHB4JyxcclxuICAgICAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKC01MCUpJyxcclxuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiAnMTJweCAyNHB4JyxcclxuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDI1NSwxMzMsMTYyLDAuOSknLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXHJcbiAgICAgICAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnOHB4JyxcclxuICAgICAgICAgICAgICAgICAgICBmb250U2l6ZTogJzE0cHgnLFxyXG4gICAgICAgICAgICAgICAgICAgIGJveFNoYWRvdzogJzAgNHB4IDEycHggcmdiYSgyNTUsMTMzLDE2MiwwLjIpJyxcclxuICAgICAgICAgICAgICAgICAgICBhbmltYXRpb246ICdmYWRlSW4gMC4zcydcclxuICAgICAgICAgICAgICAgIH19PlxyXG4gICAgICAgICAgICAgICAgICAgIFx1OEJCRVx1N0Y2RVx1NURGMlx1NEZERFx1NUI1OFxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICl9XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICApO1xyXG59IiwgInR5cGUgQW55RnVuY3Rpb24gPSAoLi4uYXJnczogYW55W10pID0+IGFueTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxUIGV4dGVuZHMgQW55RnVuY3Rpb24+KFxyXG4gICAgZnVuYzogVCxcclxuICAgIGxpbWl0OiBudW1iZXJcclxuKTogKC4uLmFyZ3M6IFBhcmFtZXRlcnM8VD4pID0+IFJldHVyblR5cGU8VD4gfCB2b2lkIHtcclxuICAgIGxldCBpblRocm90dGxlID0gZmFsc2U7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24odGhpczogVGhpc1BhcmFtZXRlclR5cGU8VD4sIC4uLmFyZ3M6IFBhcmFtZXRlcnM8VD4pOiBSZXR1cm5UeXBlPFQ+IHwgdm9pZCB7XHJcbiAgICAgICAgaWYgKCFpblRocm90dGxlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgICAgIGluVGhyb3R0bGUgPSB0cnVlO1xyXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGluVGhyb3R0bGUgPSBmYWxzZSwgbGltaXQpO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn0gIiwgImltcG9ydCB7XG4gICAgQ09ORklHX0tFWVMsXG4gICAgREVGQVVMVF9QT1JULFxuICAgIEx5cmljRGF0YSxcbiAgICBMeXJpY1NvdXJjZSxcbiAgICBQTFVHSU5fTkFNRSxcbiAgICBTb25nSW5mbyxcbiAgICBTT1VSQ0VfTkFNRVNcbn0gZnJvbSBcIi4vY29uc3RcIjtcbmltcG9ydCB7IHByb2Nlc3NMeXJpY3MgfSBmcm9tIFwiLi9seXJpY1wiO1xuaW1wb3J0IHsgTHlyaWNDbGllbnQgfSBmcm9tIFwiLi9jbGllbnRcIjtcbmltcG9ydCB7IENvbmZpZyB9IGZyb20gXCIuL3VpL2NvbmZpZ1wiO1xuaW1wb3J0IHsgdGhyb3R0bGUgfSBmcm9tIFwiLi91dGlsc1wiO1xuaW1wb3J0IHsgbW9uaXRvckV2ZW50cyB9IGZyb20gXCIuL3V0aWxzL2V2ZW50c1wiO1xuXG5sZXQgbHlyaWNDbGllbnQ6IEx5cmljQ2xpZW50IHwgbnVsbCA9IG51bGw7XG5cbi8vIFx1N0YxM1x1NUI1OFx1NUY1M1x1NTI0RFx1NkI0Q1x1OEJDRFx1NjU3MFx1NjM2RVxubGV0IGN1cnJlbnRMeXJpY3M6IEx5cmljRGF0YSB8IG51bGwgPSBudWxsO1xubGV0IGxhc3RQcm9ncmVzc1RpbWUgPSAwO1xubGV0IGxhc3RQbGF5U3RhdGU6ICdwYXVzZScgfCAncmVzdW1lJyA9ICdwYXVzZSc7XG5cbi8vIFx1OEJGQlx1NTNENlx1OTE0RFx1N0Y2RVxuYXN5bmMgZnVuY3Rpb24gZ2V0Q29uZmlnPFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXI+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBQcm9taXNlPFQ+IHtcbiAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IGJldHRlcm5jbS5hcHAucmVhZENvbmZpZyhrZXksIFN0cmluZyhkZWZhdWx0VmFsdWUpKTtcbiAgICByZXR1cm4gdHlwZW9mIGRlZmF1bHRWYWx1ZSA9PT0gJ251bWJlcicgPyBOdW1iZXIodmFsdWUpIGFzIFQgOiB2YWx1ZSBhcyBUO1xufVxuXG4vLyBcdTRGRERcdTVCNThcdTkxNERcdTdGNkVcbmFzeW5jIGZ1bmN0aW9uIHNhdmVDb25maWc8VCBleHRlbmRzIHN0cmluZyB8IG51bWJlcj4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgYmV0dGVybmNtLmFwcC53cml0ZUNvbmZpZyhrZXksIFN0cmluZyh2YWx1ZSkpO1xuICAgIGNvbnNvbGUubG9nKGBbJHtQTFVHSU5fTkFNRX1dIFx1OTE0RFx1N0Y2RVx1NURGMlx1NEZERFx1NUI1ODpgLCB7IGtleSwgdmFsdWUgfSk7XG59XG5cbi8vIFx1N0I0OVx1NUY4NVx1NjRBRFx1NjUzRVx1NjU3MFx1NjM2RVx1NTJBMFx1OEY3RFxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvclBsYXlpbmdEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGJldHRlcm5jbS51dGlscy53YWl0Rm9yRnVuY3Rpb24oXG4gICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGJldHRlcm5jbS5uY20uZ2V0UGxheWluZ1NvbmcoKT8uZGF0YTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgWyR7UExVR0lOX05BTUV9XSBcdTY0QURcdTY1M0VcdTY1NzBcdTYzNkVcdTVERjJcdTUyQTBcdThGN0Q6YCwgZGF0YS5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAxMDBcbiAgICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFske1BMVUdJTl9OQU1FfV0gXHU3QjQ5XHU1Rjg1XHU2NEFEXHU2NTNFXHU2NTcwXHU2MzZFXHU4RDg1XHU2NUY2OmAsIGVycm9yTWVzc2FnZSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuLy8gXHU4M0I3XHU1M0Q2XHU1RjUzXHU1MjREXHU2QjRDXHU2NkYyXHU0RkUxXHU2MDZGXG5mdW5jdGlvbiBnZXRDdXJyZW50U29uZ0luZm8oKTogU29uZ0luZm8gfCBudWxsIHtcbiAgICBjb25zdCBwbGF5aW5nID0gYmV0dGVybmNtLm5jbS5nZXRQbGF5aW5nU29uZygpO1xuICAgIGlmICghcGxheWluZz8uZGF0YSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgWyR7UExVR0lOX05BTUV9XSBcdTgzQjdcdTUzRDZcdTVGNTNcdTUyNERcdTZCNENcdTY2RjJcdTY1NzBcdTYzNkVcdTU5MzFcdThEMjVgKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHBsYXlpbmcuZGF0YS5pZCxcbiAgICAgICAgbmFtZTogcGxheWluZy5kYXRhLm5hbWUsXG4gICAgICAgIGFsaWFzOiBwbGF5aW5nLmRhdGEuYWxpYXMgfHwgW10sXG4gICAgICAgIGFydGlzdHM6IHBsYXlpbmcuZGF0YS5hcnRpc3RzPy5tYXAoYXJ0aXN0ID0+ICh7XG4gICAgICAgICAgICBpZDogYXJ0aXN0LmlkLFxuICAgICAgICAgICAgbmFtZTogYXJ0aXN0Lm5hbWVcbiAgICAgICAgfSkpIHx8IFtdLFxuICAgICAgICBhbGJ1bToge1xuICAgICAgICAgICAgaWQ6IHBsYXlpbmcuZGF0YS5hbGJ1bT8uaWQgfHwgMCxcbiAgICAgICAgICAgIG5hbWU6IHBsYXlpbmcuZGF0YS5hbGJ1bT8ubmFtZSB8fCAnJyxcbiAgICAgICAgICAgIHBpY1VybDogcGxheWluZy5kYXRhLmFsYnVtPy5waWNVcmwgfHwgJydcbiAgICAgICAgfSxcbiAgICAgICAgZHVyYXRpb246IHBsYXlpbmcuZGF0YS5kdXJhdGlvbixcbiAgICAgICAgdHJhbnNOYW1lczogcGxheWluZy5kYXRhLnRyYW5zTmFtZXNcbiAgICB9O1xufVxuXG4vLyBcdTU5MDRcdTc0MDZcdTZCNENcdTY2RjJcdTUyMDdcdTYzNjJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNvbmdDaGFuZ2UoKSB7XG4gICAgY29uc3Qgc29uZ0luZm8gPSBnZXRDdXJyZW50U29uZ0luZm8oKTtcbiAgICBpZiAoIXNvbmdJbmZvKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzb3VyY2UgPSBOdW1iZXIoYXdhaXQgYmV0dGVybmNtLmFwcC5yZWFkQ29uZmlnKENPTkZJR19LRVlTLkxZUklDX1NPVVJDRSwgTHlyaWNTb3VyY2UuUkVGSU5FRC50b1N0cmluZygpKSk7XG4gICAgY29uc3QgbHlyaWNzID0gYXdhaXQgcHJvY2Vzc0x5cmljcyhzb25nSW5mby5pZCwgc291cmNlKTtcblxuICAgIGN1cnJlbnRMeXJpY3MgPSBseXJpY3M7XG4gICAgY29uc29sZS5sb2coYFske1BMVUdJTl9OQU1FfV0gXHU0RUNFXHU2QjRDXHU4QkNEXHU2RTkwXCIke1NPVVJDRV9OQU1FU1tzb3VyY2VdfVwiXHU4M0I3XHU1M0Q2XHU1MjMwXHUzMDBBJHtzb25nSW5mby5uYW1lfVx1MzAwQlx1NzY4NFx1NkI0Q1x1OEJDRFx1RkYwQyR7bHlyaWNzLmxpbmVzLmxlbmd0aH1cdTg4NENcXG5gLCBseXJpY3MubGluZXMpO1xuXG4gICAgLy8gXHU2NkY0XHU2NUIwVUlcbiAgICBtb25pdG9yRXZlbnRzLmVtaXQoe1xuICAgICAgICBzb25nOiBzb25nSW5mbyxcbiAgICAgICAgbHlyaWNzOiBseXJpY3NcbiAgICB9KTtcblxuICAgIC8vIFx1NTNEMVx1OTAwMVx1NjU3MFx1NjM2RVxuICAgIGF3YWl0IGx5cmljQ2xpZW50Py5zZW5kU29uZ0luZm8oc29uZ0luZm8pO1xuICAgIGF3YWl0IGx5cmljQ2xpZW50Py5zZW5kTHlyaWMobHlyaWNzKTtcbiAgICBhd2FpdCBseXJpY0NsaWVudD8uc2VuZFBsYXlTdGF0ZShsYXN0UGxheVN0YXRlKTtcbn1cblxuLy8gXHU3NkQxXHU1NDJDXHU2NEFEXHU2NTNFXHU4RkRCXHU1RUE2XG5jb25zdCBoYW5kbGVQcm9ncmVzcyA9IHRocm90dGxlKChfLCB0aW1lOiBudW1iZXIpID0+IHtcbiAgICBjb25zdCBzb25nSW5mbyA9IGdldEN1cnJlbnRTb25nSW5mbygpO1xuICAgIGlmICghc29uZ0luZm8pIHJldHVybjtcbiAgICBcbiAgICAvLyBcdTkwN0ZcdTUxNERcdTkxQ0RcdTU5MERcdTUzRDFcdTkwMDFcdTc2RjhcdTU0MENcdThGREJcdTVFQTZcbiAgICBjb25zdCBtc1RpbWUgPSBNYXRoLmZsb29yKHRpbWUgKiAxMDAwKTtcbiAgICBpZiAobXNUaW1lID09PSBsYXN0UHJvZ3Jlc3NUaW1lKSByZXR1cm47XG4gICAgbGFzdFByb2dyZXNzVGltZSA9IG1zVGltZTtcbiAgICBcbiAgICAvLyBcdTY2RjRcdTY1QjBVSVxuICAgIG1vbml0b3JFdmVudHMuZW1pdCh7XG4gICAgICAgIHByb2dyZXNzOiB7IHRpbWU6IG1zVGltZSwgZHVyYXRpb246IHNvbmdJbmZvLmR1cmF0aW9uIH1cbiAgICB9KTtcblxuICAgIC8vIFx1NTNEMVx1OTAwMVx1NjU3MFx1NjM2RVxuICAgIGx5cmljQ2xpZW50Py5zZW5kUHJvZ3Jlc3MobXNUaW1lLCBzb25nSW5mby5kdXJhdGlvbik7XG59LCAxMDApO1xuXG4vLyBcdTc2RDFcdTU0MkNcdTY0QURcdTY1M0VcdTcyQjZcdTYwMDFcbmNvbnN0IGhhbmRsZVBsYXlTdGF0ZSA9IGFzeW5jIChldnQ6IHVua25vd24sIHBsYXlTdGF0ZURhdGE6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IFtfLCBzdGF0ZV0gPSBwbGF5U3RhdGVEYXRhLnNwbGl0KCd8Jyk7XG4gICAgaWYgKHN0YXRlICE9PSAncmVzdW1lJyAmJiBzdGF0ZSAhPT0gJ3BhdXNlJykge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBbJHtQTFVHSU5fTkFNRX1dIFx1NjcyQVx1NzdFNVx1NzY4NFx1NjRBRFx1NjUzRVx1NzJCNlx1NjAwMTpgLCBzdGF0ZSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBcdTY2RjRcdTY1QjBVSVxuICAgIG1vbml0b3JFdmVudHMuZW1pdCh7XG4gICAgICAgIHBsYXlTdGF0ZTogc3RhdGVcbiAgICB9KTtcbiAgICBsYXN0UGxheVN0YXRlID0gc3RhdGU7XG5cbiAgICAvLyBcdTUzRDFcdTkwMDFcdTY1NzBcdTYzNkVcbiAgICBseXJpY0NsaWVudD8uc2VuZFBsYXlTdGF0ZShzdGF0ZSk7XG59O1xuXG4vLyBcdTc2RDFcdTU0MkNcdTY0QURcdTY1M0VcdThGREJcdTVFQTZcdTU0OENcdTcyQjZcdTYwMDFcbmZ1bmN0aW9uIHN0YXJ0UGxheWJhY2tNb25pdG9yKCkge1xuICAgIC8vIFx1NzZEMVx1NTQyQ1x1NkI0Q1x1NjZGMlx1NTIwN1x1NjM2MlxuICAgIGxlZ2FjeU5hdGl2ZUNtZGVyLmFwcGVuZFJlZ2lzdGVyQ2FsbChcIkxvYWRcIiwgXCJhdWRpb3BsYXllclwiLCBoYW5kbGVTb25nQ2hhbmdlKTtcblxuICAgIC8vIFx1NzZEMVx1NTQyQ1x1NjRBRFx1NjUzRVx1OEZEQlx1NUVBNlxuICAgIGxlZ2FjeU5hdGl2ZUNtZGVyLmFwcGVuZFJlZ2lzdGVyQ2FsbChcIlBsYXlQcm9ncmVzc1wiLCBcImF1ZGlvcGxheWVyXCIsIGhhbmRsZVByb2dyZXNzKTtcblxuICAgIC8vIFx1NzZEMVx1NTQyQ1x1NjRBRFx1NjUzRVx1NzJCNlx1NjAwMVxuICAgIGxlZ2FjeU5hdGl2ZUNtZGVyLmFwcGVuZFJlZ2lzdGVyQ2FsbChcIlBsYXlTdGF0ZVwiLCBcImF1ZGlvcGxheWVyXCIsIGhhbmRsZVBsYXlTdGF0ZSk7XG59XG5cbi8vIFx1NTA1Q1x1NkI2Mlx1NzZEMVx1NTQyQ1xuZnVuY3Rpb24gc3RvcFBsYXliYWNrTW9uaXRvcigpIHtcbiAgICBsZWdhY3lOYXRpdmVDbWRlci5yZW1vdmVSZWdpc3RlckNhbGwoXCJMb2FkXCIsIFwiYXVkaW9wbGF5ZXJcIik7XG4gICAgbGVnYWN5TmF0aXZlQ21kZXIucmVtb3ZlUmVnaXN0ZXJDYWxsKFwiUGxheVByb2dyZXNzXCIsIFwiYXVkaW9wbGF5ZXJcIik7XG4gICAgbGVnYWN5TmF0aXZlQ21kZXIucmVtb3ZlUmVnaXN0ZXJDYWxsKFwiUGxheVN0YXRlXCIsIFwiYXVkaW9wbGF5ZXJcIik7XG59XG5cbi8vIFx1OTE0RFx1N0Y2RVx1NzU0Q1x1OTc2MlxucGx1Z2luLm9uQ29uZmlnKCgpID0+IHtcbiAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBSZWFjdERPTS5yZW5kZXIoUmVhY3QuY3JlYXRlRWxlbWVudChDb25maWcsIHtcbiAgICAgICAgb25TYXZlOiBhc3luYyBwb3J0ID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHNhdmVDb25maWcoQ09ORklHX0tFWVMuUE9SVCwgcG9ydCk7XG4gICAgICAgICAgICBhd2FpdCBseXJpY0NsaWVudD8udXBkYXRlUG9ydChwb3J0KTtcbiAgICAgICAgfSxcbiAgICAgICAgb25MeXJpY1NvdXJjZUNoYW5nZTogYXN5bmMgc291cmNlID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHNhdmVDb25maWcoQ09ORklHX0tFWVMuTFlSSUNfU09VUkNFLCBzb3VyY2UpO1xuICAgICAgICAgICAgLy8gXHU5MUNEXHU2NUIwXHU4M0I3XHU1M0Q2XHU2QjRDXHU4QkNEXG4gICAgICAgICAgICBhd2FpdCBoYW5kbGVTb25nQ2hhbmdlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGRlZmF1bHRQb3J0OiBERUZBVUxUX1BPUlQsXG4gICAgICAgIGRlZmF1bHRMeXJpY1NvdXJjZTogTHlyaWNTb3VyY2UuUkVGSU5FRFxuICAgIH0pLCBlbGVtZW50KTtcbiAgICByZXR1cm4gZWxlbWVudDtcbn0pO1xuXG4vLyBcdTYzRDJcdTRFRjZcdTUyQTBcdThGN0RcdTY1RjZcdTYyNjdcdTg4NENcbnBsdWdpbi5vbkxvYWQoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHdhaXRGb3JQbGF5aW5nRGF0YSgpO1xuICAgICAgICBjb25zdCBzYXZlZFBvcnQgPSBhd2FpdCBnZXRDb25maWcoQ09ORklHX0tFWVMuUE9SVCwgREVGQVVMVF9QT1JUKTtcblxuICAgICAgICAvLyBcdTU0MkZcdTUyQThcdTZCNENcdThCQ0RcdTVCQTJcdTYyMzdcdTdBRUZcbiAgICAgICAgbHlyaWNDbGllbnQgPSBuZXcgTHlyaWNDbGllbnQoc2F2ZWRQb3J0KTtcblxuICAgICAgICAvLyBcdThCQkVcdTdGNkVcdTkxQ0RcdThGREVcdTU2REVcdThDMDNcbiAgICAgICAgbHlyaWNDbGllbnQub25SZWNvbm5lY3QgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzb25nSW5mbyA9IGdldEN1cnJlbnRTb25nSW5mbygpO1xuICAgICAgICAgICAgaWYgKCFzb25nSW5mbykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IGx5cmljQ2xpZW50Py5zZW5kU29uZ0luZm8oc29uZ0luZm8pO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRMeXJpY3MpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBseXJpY0NsaWVudD8uc2VuZEx5cmljKGN1cnJlbnRMeXJpY3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbHlyaWNDbGllbnQ/LnNlbmRQbGF5U3RhdGUobGFzdFBsYXlTdGF0ZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gXHU1MTQ4XHU1M0QxXHU5MDAxXHU1MjFEXHU1OUNCXHU0RkUxXHU2MDZGXG4gICAgICAgIGF3YWl0IGhhbmRsZVNvbmdDaGFuZ2UoKTtcblxuICAgICAgICAvLyBcdTUxOERcdTU0MkZcdTUyQThcdThGREJcdTVFQTZcdTc2RDFcdTU0MkNcdTU0OENcdTcyQjZcdTYwMDFcdTc2RDFcdTU0MkNcbiAgICAgICAgc3RhcnRQbGF5YmFja01vbml0b3IoKTtcblxuICAgICAgICAvLyBcdTZDRThcdTUxOENcdTZFMDVcdTc0MDZcdTUxRkRcdTY1NzBcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsICgpID0+IHtcbiAgICAgICAgICAgIHN0b3BQbGF5YmFja01vbml0b3IoKTtcbiAgICAgICAgICAgIGx5cmljQ2xpZW50Py5kaXNwb3NlKCk7XG4gICAgICAgICAgICBseXJpY0NsaWVudCA9IG51bGw7XG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICAgICAgY29uc29sZS5lcnJvcihgWyR7UExVR0lOX05BTUV9XSBcdTYzRDJcdTRFRjZcdTUyQTBcdThGN0RcdTU5MzFcdThEMjU6YCwgZXJyb3JNZXNzYWdlKTtcbiAgICB9XG59KTsiXSwKICAibWFwcGluZ3MiOiAiOztBQUdPLE1BQU0sY0FBYztBQUNwQixNQUFNLGVBQWU7QUFTckIsTUFBTSxlQUFlO0FBQUEsSUFDeEIsQ0FBQyxlQUFtQixHQUFHO0FBQUEsSUFDdkIsQ0FBQyxnQkFBb0IsR0FBRztBQUFBLElBQ3hCLENBQUMsZ0JBQW9CLEdBQUc7QUFBQSxFQUM1QjtBQUdPLE1BQU0sY0FBYztBQUFBLElBQ3ZCLE1BQU0sR0FBRztBQUFBLElBQ1QsY0FBYyxHQUFHO0FBQUEsRUFDckI7OztBQ3BCQSxNQUFJLFdBQW9DO0FBR3hDLGlCQUFlLGlCQUFpQixRQUEyQztBQUN2RSxRQUFJLENBQUMsT0FBTyxpQkFBaUI7QUFDekIsY0FBUSxJQUFJLElBQUksbURBQW9DO0FBQ3BELGFBQU87QUFBQSxJQUNYO0FBR0EsVUFBTSxVQUFVLE1BQU07QUFBQSxNQUNsQixNQUFNLE9BQU8sZUFBZSxNQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ2pEO0FBQUE7QUFBQSxJQUNKO0FBR0EsVUFBTUEsaUJBQWdCLE9BQU87QUFHN0IsUUFBSUEsZ0JBQWUsUUFBUSxTQUFTLEdBQUc7QUFDbkMsYUFBTyxFQUFFLE9BQU9BLGVBQWMsT0FBTztBQUFBLElBQ3pDO0FBRUEsV0FBTztBQUFBLEVBQ1g7QUFHQSxpQkFBZSxrQkFBa0IsUUFBMkM7QUFDeEUsVUFBTSxZQUFZLE1BQU0sY0FBYyxTQUFTLGFBQWEsTUFBTTtBQUNsRSxZQUFRLElBQUksSUFBSSxzREFBd0IsU0FBUztBQUVqRCxRQUFJLFVBQVUsU0FBUyxLQUFLO0FBQ3hCLGNBQVEsTUFBTSxJQUFJLDZDQUF5QixVQUFVLEtBQUs7QUFDMUQsYUFBTztBQUFBLElBQ1g7QUFFQSxVQUFNLFlBQVksVUFBVSxLQUFLLFNBQVMsSUFBSSxRQUFRLFdBQVcsR0FBRztBQUNwRSxVQUFNLGNBQWMsVUFBVSxRQUFRLFNBQVM7QUFD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Z0JBQWdCLGVBQWUsY0FBYztBQUdsRixzQkFBa0IsbUJBQW1CLGFBQWEsZUFBZSxlQUFlO0FBQUEsRUFDcEY7QUFHQSxXQUFTLHNCQUFzQjtBQUMzQixzQkFBa0IsbUJBQW1CLFFBQVEsYUFBYTtBQUMxRCxzQkFBa0IsbUJBQW1CLGdCQUFnQixhQUFhO0FBQ2xFLHNCQUFrQixtQkFBbUIsYUFBYSxhQUFhO0FBQUEsRUFDbkU7QUFHQSxTQUFPLFNBQVMsTUFBTTtBQUNsQixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsYUFBUyxPQUFPLE1BQU0sY0FBYyxRQUFRO0FBQUEsTUFDeEMsUUFBUSxPQUFNLFNBQVE7QUFDbEIsY0FBTSxXQUFXLFlBQVksTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sYUFBYSxXQUFXLElBQUk7QUFBQSxNQUN0QztBQUFBLE1BQ0EscUJBQXFCLE9BQU0sV0FBVTtBQUNqQyxjQUFNLFdBQVcsWUFBWSxjQUFjLE1BQU07QUFFakQsY0FBTSxpQkFBaUI7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsYUFBYTtBQUFBLE1BQ2I7QUFBQSxJQUNKLENBQUMsR0FBRyxPQUFPO0FBQ1gsV0FBTztBQUFBLEVBQ1gsQ0FBQztBQUdELFNBQU8sT0FBTyxZQUFZO0FBQ3RCLFFBQUk7QUFDQSxZQUFNLG1CQUFtQjtBQUN6QixZQUFNLFlBQVksTUFBTSxVQUFVLFlBQVksTUFBTSxZQUFZO0FBR2hFLG9CQUFjLElBQUksWUFBWSxTQUFTO0FBR3ZDLGtCQUFZLGNBQWMsWUFBWTtBQUNsQyxjQUFNLFdBQVcsbUJBQW1CO0FBQ3BDLFlBQUksQ0FBQyxVQUFVO0FBQ1g7QUFBQSxRQUNKO0FBQ0EsY0FBTSxhQUFhLGFBQWEsUUFBUTtBQUN4QyxZQUFJLGVBQWU7QUFDZixnQkFBTSxhQUFhLFVBQVUsYUFBYTtBQUFBLFFBQzlDO0FBQ0EsY0FBTSxhQUFhLGNBQWMsYUFBYTtBQUFBLE1BQ2xEO0FBR0EsWUFBTSxpQkFBaUI7QUFHdkIsMkJBQXFCO0FBR3JCLGFBQU8saUJBQWlCLGdCQUFnQixNQUFNO0FBQzFDLDRCQUFvQjtBQUNwQixxQkFBYSxRQUFRO0FBQ3JCLHNCQUFjO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0wsU0FBUyxPQUFQO0FBQ0UsWUFBTSxlQUFlLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFDMUUsY0FBUSxNQUFNLElBQUksc0RBQXdCLFlBQVk7QUFBQSxJQUMxRDtBQUFBLEVBQ0osQ0FBQzsiLAogICJuYW1lcyI6IFsiY3VycmVudEx5cmljcyJdCn0K
