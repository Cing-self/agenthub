import SwiftUI

struct ConnectionSheet: View {
    @ObservedObject var store: ChatStore
    @Environment(\.dismiss) private var dismiss
    @State private var baseURL = ""
    @State private var token = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Bridge") {
                    TextField("Base URL", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.URL)
                        .keyboardType(.URL)

                    SecureField("Token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("推荐") {
                    Button("使用默认 Cloudflare 控制入口") {
                        baseURL = BridgeConfig.default.baseURL
                    }
                }

                Section("说明") {
                    Text("这版先直接连接现有 remote bridge。后面语音、远程控制、设备权限都在这个原生 App 里继续扩。")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("连接本地 Agent")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("连接") {
                        store.applyConfig(baseURL: baseURL, token: token)
                        Task {
                            await store.connect()
                            if case .connected = store.connectionState {
                                dismiss()
                            }
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                baseURL = store.config.baseURL
                token = store.config.token
            }
        }
    }
}
