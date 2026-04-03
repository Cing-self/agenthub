import SwiftUI

struct RootChatView: View {
    @ObservedObject var store: ChatStore
    @FocusState private var isComposerFocused: Bool
    @State private var didRunStartup = false

    var body: some View {
        ZStack(alignment: .leading) {
            backgroundGradient
                .ignoresSafeArea()

            chatSurface

            if store.isShowingHistory {
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                            store.isShowingHistory = false
                        }
                    }

                HistoryDrawerView(store: store)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }

            if store.connectionState == .connecting {
                ConnectingOverlay()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .sheet(isPresented: $store.isShowingConnectionSheet) {
            ConnectionSheet(store: store)
                .presentationDetents([.medium, .large])
        }
        .task {
            guard !didRunStartup else { return }
            didRunStartup = true

            if store.config.token.isEmpty {
                store.isShowingConnectionSheet = true
                return
            }

            await store.connect()
        }
    }

    private var chatSurface: some View {
        VStack(spacing: 14) {
            headerBar

            messageTimeline

            composerBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                    store.isShowingHistory = true
                }
            } label: {
                Image(systemName: "sidebar.leading")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(.white.opacity(0.8), in: Circle())
            }
            .buttonStyle(.plain)

            VStack(spacing: 2) {
                Text(store.selectedThread?.thread.title ?? "Lobster")
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)

                Text(connectionSummary)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)

            Button {
                if store.connectionState == .connected {
                    store.startNewConversation()
                    isComposerFocused = true
                } else {
                    store.isShowingConnectionSheet = true
                }
            } label: {
                Image(systemName: store.connectionState == .connected ? "square.and.pencil" : "bolt.horizontal.circle")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(Color.accentColor.opacity(0.14), in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private var messageTimeline: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    dayChip

                    if let thread = store.selectedThread, !thread.messages.isEmpty {
                        ForEach(thread.messages) { message in
                            MessageRow(message: message)
                                .id(message.id)
                        }
                    } else {
                        EmptyConversationCard()
                    }
                }
                .padding(.vertical, 12)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .scrollIndicators(.hidden)
            .onChange(of: store.selectedThread?.messages.count) { _, _ in
                if let lastID = store.selectedThread?.messages.last?.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastID, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var dayChip: some View {
        Text("Today")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
            .background(.white.opacity(0.75), in: Capsule())
            .frame(maxWidth: .infinity)
    }

    private var composerBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Send message...", text: $store.draft, axis: .vertical)
                    .focused($isComposerFocused)
                    .lineLimit(1 ... 5)
                    .textFieldStyle(.plain)

                Button {
                    Task {
                        await store.sendCurrentDraft()
                    }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(Color.black.opacity(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.25 : 0.82), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending)
            }

            if case .failed(let message) = store.connectionState {
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
            } else {
                Text(store.connectionState == .connected ? "先把聊天跑通，后面这里会接入原生语音。" : "先连上你的本地 Bridge，再开始对话。")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 10)
    }

    private var connectionSummary: String {
        if let updatedAt = store.selectedThread?.thread.updatedAt, !updatedAt.isEmpty {
            return updatedAt
        }

        return headerSubtitle
    }

    private var headerSubtitle: String {
        if let updatedAt = store.selectedThread?.thread.updatedAt, !updatedAt.isEmpty {
            return updatedAt
        }

        switch store.connectionState {
        case .connected:
            return "Local bridge connected"
        case .connecting:
            return "Connecting..."
        case .failed:
            return "Connection issue"
        case .disconnected:
            return "Waiting to connect"
        }
    }

    private var backgroundGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.99, green: 0.97, blue: 0.95),
                Color(red: 0.95, green: 0.93, blue: 0.90),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

private struct EmptyConversationCard: View {
    var body: some View {
        VStack(spacing: 12) {
            Circle()
                .fill(Color.accentColor.opacity(0.14))
                .frame(width: 54, height: 54)
                .overlay {
                    Text("L")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color.accentColor)
                }

            Text("开始一段新对话")
                .font(.system(size: 20, weight: .semibold))

            Text("这里会直接连到你本地机器上的 Agent，后面语音和远程控制都会复用这一层。")
                .multilineTextAlignment(.center)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 48)
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity)
    }
}

private struct ConnectingOverlay: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(.circular)
            Text("正在连接本地 Bridge…")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.06).ignoresSafeArea())
    }
}

private struct MessageRow: View {
    let message: BridgeMessage

    var body: some View {
        HStack {
            if message.isAssistant {
                bubble
                Spacer(minLength: 32)
            } else {
                Spacer(minLength: 32)
                bubble
            }
        }
    }

    private var bubble: some View {
        VStack(alignment: message.isAssistant ? .leading : .trailing, spacing: 6) {
            Text(message.content)
                .font(.system(size: 16))
                .foregroundStyle(.primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(bubbleBackground, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            HStack(spacing: 6) {
                Text(message.isAssistant ? (message.agentId ?? "Lobster") : "你")
                if let timestamp = message.timestamp {
                    Text(timestamp)
                        .lineLimit(1)
                }
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: 290, alignment: message.isAssistant ? .leading : .trailing)
    }

    private var bubbleBackground: some ShapeStyle {
        if message.isAssistant {
            return AnyShapeStyle(Color.white.opacity(0.86))
        }

        return AnyShapeStyle(
            LinearGradient(
                colors: [
                    Color(red: 0.99, green: 0.95, blue: 0.92),
                    Color(red: 0.98, green: 0.93, blue: 0.90),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

struct RootChatView_Previews: PreviewProvider {
    static var previews: some View {
        RootChatView(store: previewStore)
    }

    @MainActor
    private static var previewStore: ChatStore {
        let store = ChatStore()
        store.connectionState = .connected
        store.selectedThread = ThreadEnvelope(
            thread: ThreadSummary(
                id: "preview",
                title: "Lobster",
                goal: nil,
                primaryAgentId: "dolphin",
                latestMessagePreview: nil,
                updatedAt: "Today"
            ),
            messages: [
                BridgeMessage(id: "1", role: "assistant", content: "你好，我已经在这里了。", timestamp: "09:57", agentId: "Lobster"),
                BridgeMessage(id: "2", role: "user", content: "下一步我们就做原生 iOS App。", timestamp: "09:58", agentId: nil),
            ]
        )
        return store
    }
}
