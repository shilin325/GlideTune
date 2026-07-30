# GlideTune · 手势驱动音乐播放器

React + TypeScript + Vite 移动端风格播放页，支持 **三维环绕封面**、**摄像头手势交互**、**本地上传** 与 **节奏小游戏**。

## 功能

### 播放器

- 浅色沉浸布局，三维圆柱环绕专辑封面（可切换平铺列表）
- 播放时当前封面按歌曲 BPM 节拍脉冲
- 播放 / 暂停、上一首 / 下一首、可拖拽进度条
- 收藏列表抽屉；分享卡片（多配色，可保存图片）
- 内置 6 首 Mock 曲目；支持上传本地 **MP3 / WAV** 加入播放列表

### 封面交互

- **环绕模式**：左右滑旋转切歌；双击当前封面切到平铺
- **平铺模式**：当前曲大封面 + 横向小封面列表；双击大封面回到环绕，点小封面切歌
- 边界滑到尽头时回弹提示

### 摄像头手势

点击左上角 **「开启手势交互」**，授权摄像头后：

- MediaPipe 实时检测 **21 个手部关键点**
- Canvas 绘制骨架连线 + 指尖粒子拖尾
- 首次加载约 **20MB** 本地模型（`public/mediapipe/`），界面显示进度；完成后浏览器会缓存


| 场景  | 手势          | 动作        |
| --- | ----------- | --------- |
| 播放页 | 左 / 右滑      | 下一首 / 上一首 |
| 播放页 | 张开手掌        | 播放 / 暂停   |
| 播放页 | 握拳          | 暂停        |
| 播放页 | 点赞 / 点踩     | 收藏 / 取消收藏 |
| 播放页 | 比耶（Victory） | 打开分享卡     |
| 播放页 | 捏合          | 环绕 ↔ 平铺切换 |
| 分享卡 | 上 / 下滑      | 切换配色      |
| 分享卡 | 点赞 / 点踩     | 保存图片 / 取消 |


需在 **HTTPS 或 localhost** 下使用，并允许摄像头权限。游戏打开时播放页手势让位给落键命中。

### 音符游戏

顶部 **「游戏」** 进入节奏小游戏：音符随当前歌曲时间轴下落，用手掌/食指在判定线击打；谱面节拍使用歌曲 `bpm`。

## 启动

```bash
cd music-player
npm install
npm run dev
```

浏览器打开终端提示的本地地址即可。

```bash
npm run build    # 生产构建
npm run preview  # 预览构建产物
```



## 技术说明


| 模块      | 实现                                                             |
| ------- | -------------------------------------------------------------- |
| 构建      | Vite 4                                                         |
| UI      | React 18 + TypeScript + Tailwind CSS 3                         |
| 封面交互    | `@use-gesture/react` + CSS 3D                                  |
| 手部追踪    | `@mediapipe/tasks-vision` GestureRecognizer（本地 wasm + `.task`） |
| 粒子 / 骨架 | Canvas 2D（`src/hand/particleSystem.ts`）                        |
| 音频      | 原生 `Audio` API（`src/hooks/useAudioPlayer.ts`）                  |
| 节奏游戏    | `src/game/rhythmEngine.ts`                                     |
| 数据      | `src/data/songs.ts`（含 `bpm`）；上传曲默认 BPM 118                     |




## 目录

```
src/
  components/   # 播放器、封面、手势层、分享、上传、游戏等
  hand/         # 手势识别、粒子系统、类型
  hooks/        # 音频播放 / MediaPipe 手部追踪
  game/         # 节奏谱面与判定
  data/         # Mock 歌曲
public/
  mediapipe/    # 手势模型与 wasm（首次加载）
```

