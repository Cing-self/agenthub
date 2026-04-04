import SwiftUI

struct HistoryDrawerView: View {
    @ObservedObject var store: ChatStore

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            workspaceCard
            newConversationButton
            threadsList
            footerNote
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 16)
        .frame(width: 338)
        .frame(maxHeight: .infinity)
        .background(
            LinearGradient(
                colors: [
                    Color(uiColor: .systemBackground),
                    Color(red: 0.96, green: 0.97, blue: 0.96),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Color.black.opacity(0.06))
                .frame(width: 1)
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Remote Workspace")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                Text("Lobster")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.primary)

                Text("Native control surface for your local agent.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button(action: closeDrawer) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.primary)
                    .frame(width: 34, height: 34)
                    .background(Color.black.opacity(0.05), in: Circle())
            }
            .buttonStyle(.plain)
        }
    }

    private var workspaceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color.accentColor.opacity(0.14))
                    .frame(width: 42, height: 42)
                    .overlay {
                        Image(systemName: "lock.laptopcomputer")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Color.accentColor)
                    }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Local-first runtime")
                        .font(.system(size: 15, weight: .semibold))
                    Text("\(store.threads.count) threads available")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Text("Keep chat, voice, and future control actions attached to the same machine and bridge contract.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(Color.white.opacity(0.76), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var newConversationButton: some View {
        Button(action: createConversation) {
            HStack {
                Label("New conversation", systemImage: "square.and.pencil")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var threadsList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(store.threads) { thread in
                    ThreadCell(
                        thread: thread,
                        isSelected: store.selectedThreadID == thread.id,
                        action: {
                            Task {
                                try? await store.loadThread(id: thread.id)
                            }
                        }
                    )
                }
            }
            .padding(.bottom, 8)
        }
    }

    private var footerNote: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Next up")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("Voice capture and real control actions will land here before more channels.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }

    private func closeDrawer() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.92)) {
            store.isShowingHistory = false
        }
    }

    private func createConversation() {
        store.startNewConversation()
        closeDrawer()
    }
}

private struct ThreadCell: View {
    let thread: ThreadSummary
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(isSelected ? Color.accentColor.opacity(0.18) : Color.black.opacity(0.06))
                        .frame(width: 34, height: 34)
                        .overlay {
                            Image(systemName: isSelected ? "bubble.left.and.bubble.right.fill" : "bubble.left")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(isSelected ? Color.accentColor : .secondary)
                        }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(thread.title ?? "Untitled")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Text(thread.latestMessagePreview ?? thread.goal ?? "No messages yet")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 0)
                }

                if let updatedAt = thread.updatedAt, !updatedAt.isEmpty {
                    Text(updatedAt)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isSelected ? Color.accentColor.opacity(0.11) : Color.white.opacity(0.78),
                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(isSelected ? Color.accentColor.opacity(0.25) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
