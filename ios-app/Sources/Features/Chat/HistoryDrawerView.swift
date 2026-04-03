import SwiftUI

struct HistoryDrawerView: View {
    @ObservedObject var store: ChatStore

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("历史对话")
                        .font(.system(size: 22, weight: .semibold))
                    Text("展开即可切换上下文")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button("关闭") {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                        store.isShowingHistory = false
                    }
                }
                .buttonStyle(.plain)
            }

            Button {
                store.startNewConversation()
            } label: {
                Label("新对话", systemImage: "square.and.pencil")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(store.threads) { thread in
                        Button {
                            Task {
                                try? await store.loadThread(id: thread.id)
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .top) {
                                    Text(thread.title ?? "未命名对话")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Spacer()
                                    Text(thread.updatedAt ?? "")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }

                                Text(thread.latestMessagePreview ?? thread.goal ?? "还没有消息")
                                    .font(.system(size: 13))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                store.selectedThreadID == thread.id
                                    ? Color.accentColor.opacity(0.12)
                                    : Color.white.opacity(0.72),
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, 12)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.top, 20)
        .padding(.bottom, 12)
        .frame(width: 316)
        .frame(maxHeight: .infinity)
        .background(.ultraThinMaterial)
    }
}
