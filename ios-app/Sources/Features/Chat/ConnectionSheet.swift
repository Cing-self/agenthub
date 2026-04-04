import SwiftUI

struct ConnectionSheet: View {
    @ObservedObject var store: ChatStore
    @Environment(\.dismiss) private var dismiss
    @State private var baseURL = ""
    @State private var token = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    heroSection
                    statusCard
                    fieldsCard
                    notesCard
                    connectButton
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
            .background(sheetBackground.ignoresSafeArea())
            .navigationTitle("Connect Bridge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                baseURL = store.config.baseURL
                token = store.config.token
            }
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Bring your local agent onto your phone.")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.primary)

            Text("Use the same remote bridge contract for chat now, then layer in native voice, notifications, and control actions.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: statusIcon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(statusColor)
                    .frame(width: 36, height: 36)
                    .background(statusColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(statusTitle)
                        .font(.system(size: 15, weight: .semibold))
                    Text(statusSubtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.8), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var fieldsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            ConnectionField(
                title: "Base URL",
                placeholder: "https://control.nanobanani.app/api",
                text: $baseURL,
                isSecure: false
            )

            ConnectionField(
                title: "Access Token",
                placeholder: "Paste the bridge token from desktop",
                text: $token,
                isSecure: true
            )

            Button(action: useDefaultBridge) {
                HStack {
                    Label("Use default Cloudflare entry", systemImage: "sparkles")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .bold))
                }
                .foregroundStyle(Color.accentColor)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Color.white.opacity(0.82), lineWidth: 1)
        )
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What this connection is for")
                .font(.system(size: 14, weight: .semibold))
            Text("This app is not a wrapped web page. It talks to the existing remote bridge directly, so the same path can later carry voice, approvals, logs, and device-native actions.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var connectButton: some View {
        Button(action: connect) {
            HStack {
                Spacer()
                if store.connectionState == .connecting {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    Text("Connect")
                        .font(.system(size: 16, weight: .semibold))
                }
                Spacer()
            }
            .foregroundStyle(.white)
            .padding(.vertical, 16)
            .background(
                canConnect ? Color.accentColor : Color.black.opacity(0.22),
                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(!canConnect || store.connectionState == .connecting)
    }

    private var canConnect: Bool {
        !baseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var statusTitle: String {
        switch store.connectionState {
        case .connected:
            return "Bridge connected"
        case .connecting:
            return "Connecting"
        case .failed:
            return "Connection issue"
        case .disconnected:
            return "Waiting for credentials"
        }
    }

    private var statusSubtitle: String {
        switch store.connectionState {
        case .connected:
            return "The native app can now read threads and send turns."
        case .connecting:
            return "Trying to reach your local runtime."
        case .failed(let message):
            return message
        case .disconnected:
            return "Paste the URL and token from the desktop bridge screen."
        }
    }

    private var statusIcon: String {
        switch store.connectionState {
        case .connected:
            return "checkmark.circle.fill"
        case .connecting:
            return "arrow.triangle.2.circlepath"
        case .failed:
            return "exclamationmark.triangle.fill"
        case .disconnected:
            return "lock.circle"
        }
    }

    private var statusColor: Color {
        switch store.connectionState {
        case .connected:
            return Color.accentColor
        case .connecting:
            return .orange
        case .failed:
            return .red
        case .disconnected:
            return .secondary
        }
    }

    private var sheetBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.95, green: 0.97, blue: 0.96),
                Color(red: 0.92, green: 0.95, blue: 0.94),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func useDefaultBridge() {
        baseURL = BridgeConfig.default.baseURL
    }

    private func connect() {
        store.applyConfig(baseURL: baseURL, token: token)
        Task {
            await store.connect()
            if case .connected = store.connectionState {
                dismiss()
            }
        }
    }
}

private struct ConnectionField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    let isSecure: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .font(.system(size: 16))
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}
