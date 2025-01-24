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

## 依赖

- BetterNCM
- RefinedNowPlaying（推荐）
- LibLyric（可选）
