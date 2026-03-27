export default function MessagesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <span className="text-2xl">📨</span>
      <p className="text-[13px] font-medium text-foreground">消息</p>
      <p className="text-[12px] max-w-xs text-center">跨 Agent 的消息流汇总——来自 Discord、飞书、Slack 等频道的消息统一在这里查看</p>
      <p className="text-[11px] mt-2">即将推出</p>
    </div>
  );
}
