const HIGHLIGHTS = [
  { title: '摄像头手势', desc: '滑动切歌、张开掌心播放、握拳暂停、比耶分享' },
  { title: '三维环绕封面', desc: '滑动旋转、捏合切换平铺布局' },
  { title: '节拍封面', desc: '播放时检测歌曲 BPM 并驱动封面动效' },
  { title: '本地上传', desc: '支持 MP3 / WAV 加入播放列表' },
  { title: '音符游戏', desc: '用手势击打下落的方块' },
]

/**
 * 播放页左侧功能简介（宽屏显示，不挡中央播放区）
 */
export function FeatureIntro() {
  return (
    <aside
      aria-label="功能简介"
      className="pointer-events-none absolute bottom-10 left-6 z-10 hidden max-w-[15.5rem] animate-fade-in xl:bottom-auto xl:top-1/2 xl:-translate-y-1/2 xl:block"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-neutral-400">
        GlideTune
      </p>
      <h2 className="mt-3 text-[1.65rem] font-semibold leading-tight tracking-tight text-neutral-900">
        用手势
        <br />
        驾驭音乐
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
        三维封面与摄像头手势结合的沉浸播放体验，收藏、分享与节奏游戏一气呵成。
      </p>

      <ul className="mt-7 space-y-3.5 border-t border-neutral-300/60 pt-6">
        {HIGHLIGHTS.map((item) => (
          <li key={item.title}>
            <p className="text-[12px] font-semibold tracking-wide text-neutral-800">
              {item.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{item.desc}</p>
          </li>
        ))}
      </ul>
    </aside>
  )
}
