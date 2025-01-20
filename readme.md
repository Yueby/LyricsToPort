# LyricsToPort

一个 BetterNCM 插件，通过 WebSocket 提供网易云音乐的实时歌词、播放状态和歌曲信息。

## 功能特点

- 支持多种歌词来源：
  - RefinedNowPlaying（优先）
  - LibLyric（备选）
  - 软件内歌词
- 实时推送播放进度
- 支持原文、翻译、罗马音歌词
- 支持逐字歌词（如果有）
- 自动重连机制

## 安装

1. 安装 [BetterNCM](https://github.com/MicroCBer/BetterNCM)
2. 下载并安装本插件
3. 重启网易云音乐

## 配置

在插件设置中可以配置：
- WebSocket 端口（默认：35010）
- 歌词来源（默认：RefinedNowPlaying）

## WebSocket API

### 连接

```javascript
const ws = new WebSocket('ws://localhost:35010');
```

### 消息格式

所有消息都是 JSON 格式，结构如下：
```typescript
{
    type: string;      // 消息类型
    timestamp: number; // 消息发送时间戳
    data: any;        // 消息数据
}
```

### 消息类型

#### 1. 歌曲切换 (`type: "song"`)
当切换歌曲时发送，包含歌曲信息和歌词数据。

```typescript
{
    type: "song",
    timestamp: number,
    data: {
        id: number,            // 歌曲ID
        name: string,          // 歌曲名
        artists: Array<{       // 艺术家
            id: number,
            name: string
        }>,
        album: {              // 专辑
            id: number,
            name: string,
            picUrl: string
        },
        duration: number,     // 时长(ms)
        lyrics?: {           // 歌词数据
            lines: Array<{
                time: number,          // 时间戳
                duration: number,      // 持续时间
                originalLyric: string, // 原文
                translatedLyric?: string,  // 翻译
                romanLyric?: string,      // 罗马音
                dynamicLyric?: Array<{    // 逐字歌词
                    time: number,
                    duration: number,
                    word: string
                }>
            }>
        }
    }
}
```

#### 2. 播放进度 (`type: "progress"`)
实时推送播放进度信息。

```typescript
{
    type: "progress",
    timestamp: number,
    data: {
        time: number,        // 当前时间(秒)
        formatted: string,   // 格式化时间 "分:秒"
        percentage: number   // 播放百分比
    }
}
```

#### 3. 错误信息 (`type: "error"`)
当发生错误时推送。

```typescript
{
    type: "error",
    timestamp: number,
    data: {
        message: string     // 错误信息
    }
}
```

### 示例代码

```javascript
const ws = new WebSocket('ws://localhost:35010');

ws.onopen = () => {
    console.log('已连接到 LyricsToPort');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
        case 'song':
            const { name, artists, lyrics } = message.data;
            console.log(`正在播放: ${name} - ${artists.map(a => a.name).join('/')}`);
            if (lyrics) {
                console.log('歌词行数:', lyrics.lines.length);
            }
            break;
            
        case 'progress':
            const { formatted, percentage } = message.data;
            console.log(`播放进度: ${formatted} (${percentage.toFixed(1)}%)`);
            break;
            
        case 'error':
            console.error('错误:', message.data.message);
            break;
    }
};

ws.onclose = () => {
    console.log('连接已断开，插件会自动尝试重连');
};
```

## 注意事项

- 插件会自动处理 WebSocket 连接的断开和重连
- 重连策略采用指数退避，最多重试 5 次
- 修改端口后会自动重新建立连接
- 建议优先使用 RefinedNowPlaying 作为歌词来源

## 依赖

- BetterNCM
- RefinedNowPlaying（推荐）
- LibLyric（可选）

## 许可证

MIT License