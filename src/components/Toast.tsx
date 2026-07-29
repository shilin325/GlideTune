interface ToastProps {
  message: string | null
}

/** 轻量操作提示 */
export function Toast({ message }: ToastProps) {
  return (
    <div
      className={`pointer-events-none absolute bottom-28 left-1/2 z-50 -translate-x-1/2 transition-all duration-250 ${
        message ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      {message ? (
        <div className="rounded-full border border-white/10 bg-black/75 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md">
          {message}
        </div>
      ) : null}
    </div>
  )
}
