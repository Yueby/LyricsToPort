# LyricsToPort

一个 BetterNCM 插件，通过 HTTP POST 请求将网易云音乐的实时歌词、播放状态和歌曲信息发送到指定端口。

## 功能特点

- 支持多种歌词来源：
  - RefinedNowPlaying（优先）
  - LibLyric（备选）
  - 软件内歌词
- 实时推送播放进度（100ms 更新间隔）
- 支持原文、翻译、罗马音歌词
- 支持逐字歌词（如果有）
- 可靠的连接机制：
  - 自动检测服务器状态
  - 断线自动重连（3秒间隔）
  - 智能的重连策略（最小1秒间隔）

## 消息格式

所有消息通过 HTTP POST 请求发送，Content-Type 为 application/json。

基础消息格式：
```typescript
{
    type: string;      // 消息类型
    timestamp: number; // 时间戳
    data: unknown;     // 消息数据
}
```

支持的消息类型：
- `song_change`: 歌曲切换
- `lyric`: 歌词更新
- `progress`: 播放进度
- `play_state`: 播放状态

## 安装

1. 安装 [BetterNCM](https://github.com/MicroCBer/BetterNCM)
2. 下载并安装本插件
3. 重启网易云音乐

## 配置

在插件设置中可以配置：
- 端口（默认：35010）
- 歌词来源（默认：RefinedNowPlaying）

## 依赖

- BetterNCM
- RefinedNowPlaying（推荐）
- LibLyric（可选）

## 性能说明

- 进度消息每 100ms 更新一次
- 连接状态检查每 3 秒一次
- 最小重连间隔 1 秒
- 消息发送超时 1 秒
