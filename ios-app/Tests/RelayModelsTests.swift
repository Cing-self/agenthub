import Foundation

private func assert(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("Assertion failed: \(message)\n", stderr)
        exit(1)
    }
}

private func testParsesDesktopPairingURL() throws {
    let payload = """
    {
      "v": 1,
      "relayBaseUrl": "https://relay.example.workers.dev/api",
      "hostId": "host_alpha",
      "inviteId": "invite_123",
      "code": "PAIR-123456",
      "expiresAt": "2026-04-03T12:05:00.000Z"
    }
    """
    let encoded = Data(payload.utf8).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    let url = "https://relay.example.workers.dev/pair#pairing=\(encoded)"

    let pairing = try RelayPairingPayload.parse(from: url)

    assert(pairing.relayBaseURL == "https://relay.example.workers.dev/api", "relayBaseURL should decode from pairing link")
    assert(pairing.hostId == "host_alpha", "hostId should decode from pairing link")
    assert(pairing.code == "PAIR-123456", "pairing code should decode from pairing link")
}

private func testSelectsFirstHostAndSessionAfterRefresh() {
    let hostA = RelayHost(
        hostId: "host_alpha",
        displayName: "Work MacBook",
        status: "online",
        lastSeenAt: "2026-04-03T12:00:00.000Z",
        capabilities: ["chat"]
    )
    let hostB = RelayHost(
        hostId: "host_beta",
        displayName: "Home Mac mini",
        status: "online",
        lastSeenAt: "2026-04-03T12:01:00.000Z",
        capabilities: ["chat"]
    )
    let sessionA1 = RelaySession(
        sessionId: "session_alpha_1",
        hostId: "host_alpha",
        title: "Plan relay v1",
        summary: "Design and implementation work",
        updatedAt: "2026-04-03T12:02:00.000Z",
        primaryAgentId: "Claude Code",
        state: "active"
    )
    let sessionA2 = RelaySession(
        sessionId: "session_alpha_2",
        hostId: "host_alpha",
        title: "Fix iOS pairing",
        summary: "SwiftUI migration",
        updatedAt: "2026-04-03T12:03:00.000Z",
        primaryAgentId: "Codex CLI",
        state: "active"
    )
    let sessionB1 = RelaySession(
        sessionId: "session_beta_1",
        hostId: "host_beta",
        title: "Review roadmap",
        summary: "Relay follow-up",
        updatedAt: "2026-04-03T12:04:00.000Z",
        primaryAgentId: "OpenClaw",
        state: "active"
    )

    var workspace = RelayWorkspaceState(
        relayBaseURL: "https://relay.example.workers.dev/api",
        clientId: "client_ios"
    )

    workspace.applyHosts([hostA, hostB])
    assert(workspace.selectedHostId == "host_alpha", "first host should be selected by default")

    workspace.applySessions([sessionA1, sessionA2], for: "host_alpha")
    assert(workspace.selectedSessionId == "session_alpha_1", "first session should be selected when host sessions load")

    workspace.selectHost("host_beta")
    workspace.applySessions([sessionB1], for: "host_beta")
    assert(workspace.selectedHostId == "host_beta", "manual host switch should stick")
    assert(workspace.selectedSessionId == "session_beta_1", "selected session should switch with selected host")
}

@main
struct RelayModelsTestsRunner {
    static func main() throws {
        try testParsesDesktopPairingURL()
        testSelectsFirstHostAndSessionAfterRefresh()
        print("RelayModelsTests passed")
    }
}
