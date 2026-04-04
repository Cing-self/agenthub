import SwiftUI

struct RootChatView: View {
    @ObservedObject var store: ChatStore
    @FocusState private var isComposerFocused: Bool
    @State private var didRunStartup = false

    var body: some View {
        ZStack(alignment: .leading) {
            ChatCanvasBackground()
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ChatTopBar(
                    title: store.selectedThread?.thread.title ?? "Lobster",
                    subtitle: topBarSubtitle,
                    connectionState: store.connectionState,
                    onSidebarTap: openHistory,
                    onPrimaryTap: handlePrimaryAction
                )

                ChatSessionStrip(
                    thread: store.selectedThread?.thread,
                    connectionState: store.connectionState,
                    onConnectTap: showConnectionSheet,
                    onNewThreadTap: startFreshThread
                )

                ChatTimeline(
                    thread: store.selectedThread,
                    connectionState: store.connectionState,
                    onConnectTap: showConnectionSheet,
                    onStartNewTap: startFreshThread
                )

                ComposerDock(
                    draft: $store.draft,
                    composerFocus: $isComposerFocused,
                    isSending: store.isSending,
                    connectionState: store.connectionState,
                    accessorySymbol: store.connectionState == .connected ? "square.and.pencil" : "bolt.horizontal.circle",
                    accessoryAction: handlePrimaryAction,
                    sendAction: sendDraft
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 8)

            if store.isShowingHistory {
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                    .onTapGesture(perform: closeHistory)

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

    private var topBarSubtitle: String {
        if let updatedAt = store.selectedThread?.thread.updatedAt, !updatedAt.isEmpty {
            return updatedAt
        }

        switch store.connectionState {
        case .connected:
            return "Remote bridge online"
        case .connecting:
            return "Connecting to bridge"
        case .failed:
            return "Connection issue"
        case .disconnected:
            return "Not connected"
        }
    }

    private func openHistory() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            store.isShowingHistory = true
        }
    }

    private func closeHistory() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.92)) {
            store.isShowingHistory = false
        }
    }

    private func showConnectionSheet() {
        store.isShowingConnectionSheet = true
    }

    private func startFreshThread() {
        store.startNewConversation()
        isComposerFocused = true
    }

    private func handlePrimaryAction() {
        if store.connectionState == .connected {
            startFreshThread()
        } else {
            showConnectionSheet()
        }
    }

    private func sendDraft() {
        Task {
            await store.sendCurrentDraft()
        }
    }
}

private enum MobileChatPalette {
    static let panel = Color(uiColor: .systemBackground)
    static let secondaryPanel = Color(uiColor: .secondarySystemBackground)
    static let tertiaryPanel = Color(uiColor: .tertiarySystemBackground)
    static let ink = Color(uiColor: .label)
    static let muted = Color(uiColor: .secondaryLabel)
    static let line = Color.black.opacity(0.06)
    static let userBubble = Color(red: 0.14, green: 0.15, blue: 0.17)
}

private struct ChatCanvasBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 0.97, blue: 0.96),
                    Color(red: 0.93, green: 0.95, blue: 0.94),
                    Color(red: 0.92, green: 0.94, blue: 0.93),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color.accentColor.opacity(0.10))
                .frame(width: 320, height: 320)
                .blur(radius: 110)
                .offset(x: 150, y: -230)

            Circle()
                .fill(Color.white.opacity(0.65))
                .frame(width: 260, height: 260)
                .blur(radius: 90)
                .offset(x: -140, y: 140)
        }
    }
}

private struct ChatTopBar: View {
    let title: String
    let subtitle: String
    let connectionState: ChatStore.ConnectionState
    let onSidebarTap: () -> Void
    let onPrimaryTap: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            CircleButton(symbol: "sidebar.leading", style: .soft, action: onSidebarTap)

            VStack(spacing: 3) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(MobileChatPalette.ink)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    ConnectionDot(connectionState: connectionState)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MobileChatPalette.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)

            CircleButton(
                symbol: connectionState == .connected ? "square.and.pencil" : "bolt.horizontal.circle",
                style: .accent,
                action: onPrimaryTap
            )
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(MobileChatPalette.panel.opacity(0.76), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Color.white.opacity(0.72), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 18, y: 8)
    }
}

private struct ChatSessionStrip: View {
    let thread: ThreadSummary?
    let connectionState: ChatStore.ConnectionState
    let onConnectTap: () -> Void
    let onNewThreadTap: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                SessionChip(
                    title: connectionTitle,
                    icon: connectionIcon,
                    tint: connectionTint,
                    action: onConnectTap
                )

                if let thread {
                    SessionChip(
                        title: thread.primaryAgentId ?? "Remote agent",
                        icon: "sparkles",
                        tint: Color.accentColor.opacity(0.18),
                        action: nil
                    )

                    if let goal = thread.goal, !goal.isEmpty {
                        SessionChip(
                            title: goal,
                            icon: "scope",
                            tint: Color.black.opacity(0.06),
                            action: nil
                        )
                    }
                } else {
                    SessionChip(
                        title: "New conversation",
                        icon: "square.and.pencil",
                        tint: Color.black.opacity(0.06),
                        action: onNewThreadTap
                    )
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var connectionTitle: String {
        switch connectionState {
        case .connected:
            return "Bridge online"
        case .connecting:
            return "Connecting"
        case .failed:
            return "Reconnect"
        case .disconnected:
            return "Connect bridge"
        }
    }

    private var connectionIcon: String {
        switch connectionState {
        case .connected:
            return "dot.radiowaves.left.and.right"
        case .connecting:
            return "arrow.triangle.2.circlepath"
        case .failed:
            return "exclamationmark.triangle"
        case .disconnected:
            return "link.badge.plus"
        }
    }

    private var connectionTint: Color {
        switch connectionState {
        case .connected:
            return Color.accentColor.opacity(0.18)
        case .connecting:
            return Color.orange.opacity(0.18)
        case .failed:
            return Color.red.opacity(0.18)
        case .disconnected:
            return Color.black.opacity(0.06)
        }
    }
}

private struct ChatTimeline: View {
    let thread: ThreadEnvelope?
    let connectionState: ChatStore.ConnectionState
    let onConnectTap: () -> Void
    let onStartNewTap: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ConversationDayMarker()

                    if let thread, !thread.messages.isEmpty {
                        ForEach(thread.messages) { message in
                            MessageRow(message: message)
                                .id(message.id)
                        }
                    } else {
                        EmptyConversationCard(
                            connectionState: connectionState,
                            onConnectTap: onConnectTap,
                            onStartNewTap: onStartNewTap
                        )
                    }
                }
                .padding(.horizontal, 4)
                .padding(.top, 8)
                .padding(.bottom, 26)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .scrollIndicators(.hidden)
            .onChange(of: thread?.messages.count) { _, _ in
                if let lastID = thread?.messages.last?.id {
                    withAnimation(.easeOut(duration: 0.22)) {
                        proxy.scrollTo(lastID, anchor: .bottom)
                    }
                }
            }
        }
    }
}

private struct ConversationDayMarker: View {
    var body: some View {
        HStack {
            Spacer()
            Text("Today")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(MobileChatPalette.muted)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(MobileChatPalette.panel.opacity(0.82), in: Capsule())
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.66), lineWidth: 1))
            Spacer()
        }
    }
}

private struct ComposerDock: View {
    @Binding var draft: String
    let composerFocus: FocusState<Bool>.Binding
    let isSending: Bool
    let connectionState: ChatStore.ConnectionState
    let accessorySymbol: String
    let accessoryAction: () -> Void
    let sendAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 12) {
                CircleButton(symbol: accessorySymbol, style: .soft, action: accessoryAction)

                TextField("Message your local agent", text: $draft, axis: .vertical)
                    .focused(composerFocus)
                    .lineLimit(1 ... 5)
                    .font(.system(size: 16))
                    .foregroundStyle(MobileChatPalette.ink)
                    .textFieldStyle(.plain)

                Button(action: sendAction) {
                    Group {
                        if isSending {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(.white)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 46, height: 46)
                    .background(sendButtonColor, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
            }

            HStack(spacing: 8) {
                Label(statusLine, systemImage: statusIcon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(statusColor)

                Spacer()

                Label("Voice next", systemImage: "waveform")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MobileChatPalette.muted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(MobileChatPalette.panel, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .strokeBorder(Color.white.opacity(0.78), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.08), radius: 20, y: 10)
    }

    private var sendButtonColor: Color {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending
            ? Color.black.opacity(0.22)
            : MobileChatPalette.userBubble
    }

    private var statusLine: String {
        switch connectionState {
        case .connected:
            return "Bridge connected and ready"
        case .connecting:
            return "Trying to reach your machine"
        case .failed(let message):
            return message
        case .disconnected:
            return "Connect a bridge before sending"
        }
    }

    private var statusIcon: String {
        switch connectionState {
        case .connected:
            return "checkmark.circle.fill"
        case .connecting:
            return "arrow.triangle.2.circlepath"
        case .failed:
            return "exclamationmark.circle.fill"
        case .disconnected:
            return "bolt.slash"
        }
    }

    private var statusColor: Color {
        switch connectionState {
        case .connected:
            return Color.accentColor
        case .connecting:
            return .orange
        case .failed:
            return .red
        case .disconnected:
            return MobileChatPalette.muted
        }
    }
}

private struct EmptyConversationCard: View {
    let connectionState: ChatStore.ConnectionState
    let onConnectTap: () -> Void
    let onStartNewTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                ChatAvatar(symbol: "L", tint: Color.accentColor.opacity(0.16), foreground: Color.accentColor)

                VStack(alignment: .leading, spacing: 8) {
                    Text("A cleaner remote workspace")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(MobileChatPalette.ink)

                    Text("把本地 Agent 的聊天、语音和后续控制动作都收进一个原生入口。先把连接和文本链路跑顺，后面再把语音和设备能力接上。")
                        .font(.system(size: 15))
                        .foregroundStyle(MobileChatPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(spacing: 10) {
                GhostActionRow(
                    title: connectionState == .connected ? "Start a new remote conversation" : "Connect your bridge",
                    subtitle: connectionState == .connected ? "Create a fresh thread on the same local runtime." : "Use the Cloudflare entry or your own local URL + token.",
                    symbol: connectionState == .connected ? "square.and.pencil" : "link.badge.plus",
                    action: connectionState == .connected ? onStartNewTap : onConnectTap
                )

                GhostActionRow(
                    title: "Native voice is next",
                    subtitle: "This shell is being redesigned around voice and remote-control workflows, not a webview wrapper.",
                    symbol: "waveform",
                    action: {}
                )
                .disabled(true)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MobileChatPalette.panel.opacity(0.88), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .strokeBorder(Color.white.opacity(0.78), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.05), radius: 20, y: 8)
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
        .background(MobileChatPalette.panel.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.06).ignoresSafeArea())
    }
}

private struct MessageRow: View {
    let message: BridgeMessage

    var body: some View {
        Group {
            if message.isAssistant {
                assistantRow
            } else {
                userRow
            }
        }
    }

    private var assistantRow: some View {
        HStack(alignment: .bottom, spacing: 12) {
            ChatAvatar(
                symbol: String((message.agentId ?? "L").prefix(1)).uppercased(),
                tint: Color.accentColor.opacity(0.14),
                foreground: Color.accentColor
            )

            VStack(alignment: .leading, spacing: 7) {
                MessageMetaLine(
                    title: message.agentId ?? "Lobster",
                    timestamp: message.timestamp
                )

                Text(message.content)
                    .font(.system(size: 16))
                    .foregroundStyle(MobileChatPalette.ink)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(MobileChatPalette.panel, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.72), lineWidth: 1)
                    )
            }
            .frame(maxWidth: 300, alignment: .leading)

            Spacer(minLength: 28)
        }
    }

    private var userRow: some View {
        HStack(alignment: .bottom, spacing: 12) {
            Spacer(minLength: 54)

            VStack(alignment: .trailing, spacing: 7) {
                MessageMetaLine(
                    title: "You",
                    timestamp: message.timestamp,
                    isTrailing: true
                )

                Text(message.content)
                    .font(.system(size: 16))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(MobileChatPalette.userBubble, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .frame(maxWidth: 292, alignment: .trailing)
        }
    }
}

private struct MessageMetaLine: View {
    let title: String
    let timestamp: String?
    var isTrailing = false

    var body: some View {
        HStack(spacing: 6) {
            if isTrailing {
                Spacer()
            }

            Text(title)
            if let timestamp, !timestamp.isEmpty {
                Text("·")
                Text(timestamp)
            }

            if !isTrailing {
                Spacer(minLength: 0)
            }
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(MobileChatPalette.muted)
    }
}

private struct ChatAvatar: View {
    let symbol: String
    let tint: Color
    let foreground: Color

    var body: some View {
        Circle()
            .fill(tint)
            .frame(width: 34, height: 34)
            .overlay {
                Text(symbol)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(foreground)
            }
    }
}

private struct SessionChip: View {
    let title: String
    let icon: String
    let tint: Color
    let action: (() -> Void)?

    var body: some View {
        Group {
            if let action {
                Button(action: action) {
                    chipBody
                }
                .buttonStyle(.plain)
            } else {
                chipBody
            }
        }
    }

    private var chipBody: some View {
        Label(title, systemImage: icon)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(MobileChatPalette.ink)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(tint, in: Capsule())
    }
}

private struct GhostActionRow: View {
    let title: String
    let subtitle: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 34, height: 34)
                    .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(MobileChatPalette.ink)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(MobileChatPalette.muted)
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MobileChatPalette.muted)
            }
            .padding(16)
            .background(MobileChatPalette.secondaryPanel, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct ConnectionDot: View {
    let connectionState: ChatStore.ConnectionState

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
    }

    private var color: Color {
        switch connectionState {
        case .connected:
            return Color.accentColor
        case .connecting:
            return .orange
        case .failed:
            return .red
        case .disconnected:
            return Color.black.opacity(0.25)
        }
    }
}

private struct CircleButton: View {
    enum Style {
        case soft
        case accent
    }

    let symbol: String
    let style: Style
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: 40, height: 40)
                .background(background, in: Circle())
        }
        .buttonStyle(.plain)
    }

    private var foreground: some ShapeStyle {
        switch style {
        case .soft:
            return AnyShapeStyle(MobileChatPalette.ink)
        case .accent:
            return AnyShapeStyle(.white)
        }
    }

    private var background: some ShapeStyle {
        switch style {
        case .soft:
            return AnyShapeStyle(MobileChatPalette.panel)
        case .accent:
            return AnyShapeStyle(Color.accentColor)
        }
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
