# Music Player · 沉浸式移动端播放页

React + TypeScript + Tailwind CSS 音乐播放器，支持 **触摸手势** 与 **摄像头手部关键点 + 粒子特效**。

## 功能

### 播放器 UI
- 深色渐变沉浸背景，圆形专辑封面（播放时旋转）
- 可拖拽进度条、播放/暂停、上一首/下一首

### 触摸手势（封面区）
- 左右滑动切换歌曲（阈值 50px），边界回弹 + 震动/提示
- 上下滑动调节音量并显示浮层
- 双击封面收藏（心形弹出）
- 长按封面弹出操作菜单

### 摄像头手势粒子特效（核心）
点击左上角 **「开启手势粒子特效」**，授权摄像头后：
- MediaPipe 实时检测 **21 个手部关键点**
- Canvas 绘制骨架连线 + 指尖粒子拖尾
- 识别手势时触发粒子爆发与播放器动作：

| 手势 | 动作 |
|------|------|
| 左 / 右滑 | 下一首 / 上一首 |
| 上 / 下滑 | 音量 ± |
| 张开手掌 | 播放 / 暂停 |
| 握拳 | 暂停 |
| 点赞 / 爱心手势 | 收藏 |
| 捏合 | 精调音量 |
| 指向上 | 打开菜单 |

需在 **HTTPS 或 localhost** 下使用，并允许摄像头权限。

## 启动

```bash
cd music-player
npm install
npm run dev
```

浏览器打开终端提示的本地地址即可。

## 技术说明

| 模块 | 实现 |
|------|------|
| 构建 | Vite 4 |
| UI | React 18 + TypeScript + Tailwind CSS 3 |
| 触摸手势 | `@use-gesture/react` |
| 手部追踪 | `@mediapipe/tasks-vision` GestureRecognizer |
| 粒子 / 骨架 | Canvas 2D（`src/hand/particleSystem.ts`） |
| 音频 | 原生 `Audio` API |
| 数据 | `src/data/songs.ts` 静态 Mock（6 首） |

## 目录

```
src/
  components/   # 播放器 UI、粒子层
  hand/         # 手势识别、粒子系统、类型
  hooks/        # 音频 / 手部追踪
  data/         # Mock 歌曲
```
