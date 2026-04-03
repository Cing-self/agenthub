import SwiftUI

struct RootChatView: View {
    @ObservedObject var store: ChatStore
    @FocusState private var isComposerFocused: Bool
    @State private var didRunStartup = false

    var body: some View {
        ZStack(alignment: .leading) {
            backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 14) {
                HeaderBar(
                    title: currentTitle,
                    subtitle: headerSubtitle,
                    isRelayMode: store.isRelayMode,
                    connectionState: store.connectionState,
                    onOpenHistory: openHistory,
                    onPrimaryAction: primaryAction
                )

                TimelinePane(store: store)

                ComposerBar(
                    draft: $store.draft,
                    isFocused: $isComposerFocused,
                    isRelayMode: store.isRelayMode,
                    isSending: store.isSending,
                    connectionState: store.connectionState,
                    onSend: sendDraft
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 10)

            if store.isShowingHistory {
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                    .onTapGesture(perform: closeHistory)

                HistoryDrawerView(store: store)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }

            if store.connectionState == .connecting {
                ConnectingOverlay(isRelayMode: store.isRelayMode)
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

            let hasRelay = store.connectionConfig.relay != nil
            let hasDirect = !store.connectionConfig.directBridge.token.isEmpty
            guard hasRelay || hasDirect else {
                store.isShowingConnectionSheet = true
                return
            }

            await store.connect()
        }
    }

    private var currentTitle: String {
        if store.isRelayMode {
            return store.selectedRelaySession?.title ?? store.selectedHost?.displayName ?? "Lobster"
        }

        return store.selectedThread?.thread.title ?? "Lobster"
    }

    private var headerSubtitle: String {
        if store.isRelayMode {
            if let host = store.selectedHost {
                return "\(host.displayName) · \(host.status)"
            }
        }

        switch store.connectionState {
        case .connected:
            return store.selectedThread?.thread.updatedAt ?? "Direct bridge connected"
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

    private func openHistory() {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            store.isShowingHistory = true
        }
    }

    private func closeHistory() {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            store.isShowingHistory = false
        }
    }

    private func primaryAction() {
        if store.connectionState == .connected && !store.isRelayMode {
            store.startNewConversation()
            isComposerFocused = true
            return
        }

        store.isShowingConnectionSheet = true
    }

    private func sendDraft() {
        Task {
            await store.sendCurrentDraft()
        }
    }
}

private struct HeaderBar: View {
    let title: String
    let subtitle: String
    let isRelayMode: Bool
    let connectionState: ChatStore.ConnectionState
    let onOpenHistory: () -> Void
    let onPrimaryAction: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpenHistory) {
                Image(systemName: "sidebar.leading")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(.white.opacity(0.8), in: Circle())
            }
            .buttonStyle(.plain)

            VStack(spacing: 2) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)

                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)

            Button(action: onPrimaryAction) {
                Image(systemName: primaryIconName)
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

    private var primaryIconName: String {
        if connectionState == .connected && !isRelayMode {
            return "square.and.pencil"
        }
        return "link.badge.plus"
    }
}

private struct TimelinePane: View {
    @ObservedObject var store: ChatStore

    var body: some View {
        if store.isRelayMode {
            RelaySessionPane(
                session: store.selectedRelaySession,
                host: store.selectedHost
            )
        } else {
            DirectTimelinePane(thread: store.selectedThread)
        }
    }
}

private struct DirectTimelinePane: View {
    let thread: ThreadEnvelope?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    DayChip()

                    if let thread, !thread.messages.isEmpty {
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
            .onChange(of: thread?.messages.count) { _, _ in
                if let lastID = thread?.messages.last?.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastID, anchor: .bottom)
                    }
                }
            }
        }
    }
}

private struct RelaySessionPane: View {
    let session: RelaySession?
    let host: RelayHost?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                DayChip(label: "Relay")

                if let session {
                    RelaySessionCard(session: session, host: host)
                } else {
                    RelayEmptyState()
                }
            }
            .padding(.vertical, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .scrollIndicators(.hidden)
    }
}

private struct DayChip: View {
    var label: String = "Today"

    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
            .background(.white.opacity(0.75), in: Capsule())
            .frame(maxWidth: .infinity)
    }
}

private struct ComposerBar: View {
    @Binding var draft: String
    @FocusState.Binding var isFocused: Bool
    let isRelayMode: Bool
    let isSending: Bool
    let connectionState: ChatStore.ConnectionState
    let onSend: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField(
                    isRelayMode ? "Relay text stream is coming next..." : "Send message...",
                    text: $draft,
                    axis: .vertical
                )
                .focused($isFocused)
                .lineLimit(1 ... 5)
                .textFieldStyle(.plain)
                .disabled(isRelayMode)

                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(buttonBackgroundColor, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(isSendDisabled)
            }

            if case .failed(let message) = connectionState {
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
            } else {
                Text(helperText)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 10)
    }

    private var isSendDisabled: Bool {
        isRelayMode || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending
    }

    private var buttonBackgroundColor: Color {
        isSendDisabled ? .black.opacity(0.25) : .black.opacity(0.82)
    }

    private var helperText: String {
        if isRelayMode {
            return "Relay 配对和 session 切换已经接通，文本 turn 还在接入中。需要即时聊天时先走 Advanced > Direct Bridge。"
        }
        return "先把 direct chat 跑通，后面这里会接入原生语音。"
    }
}

private struct RelaySessionCard: View {
    let session: RelaySession
    let host: RelayHost?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(session.title)
                        .font(.system(size: 22, weight: .semibold))
                    Text(host?.displayName ?? session.hostId)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(session.state)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.accentColor.opacity(0.12), in: Capsule())
            }

            if !session.summary.isEmpty {
                Text(session.summary)
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                SessionMetaRow(label: "Agent", value: session.primaryAgentId ?? "Unknown")
                SessionMetaRow(label: "Updated", value: session.updatedAt)
                SessionMetaRow(label: "Mode", value: "Relay session")
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }
}

private struct SessionMetaRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct RelayEmptyState: View {
    var body: some View {
        VStack(spacing: 12) {
            Circle()
                .fill(Color.accentColor.opacity(0.14))
                .frame(width: 54, height: 54)
                .overlay {
                    Image(systemName: "link")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color.accentColor)
                }

            Text("Select a paired session")
                .font(.system(size: 20, weight: .semibold))

            Text("Finish pairing, pick a host, then pick a session. This relay path will later carry text stream, voice, approvals, and control actions.")
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
    let isRelayMode: Bool

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(.circular)
            Text(isRelayMode ? "正在同步 Relay workspace…" : "正在连接 Direct Bridge…")
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
