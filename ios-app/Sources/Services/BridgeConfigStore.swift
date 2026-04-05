import Foundation

struct BridgeConfigStore {
    private let userDefaults: UserDefaults
    private let key: String

    init(
        userDefaults: UserDefaults = .standard,
        key: String = "lobster-mobile.bridge-config"
    ) {
        self.userDefaults = userDefaults
        self.key = key
    }

    func load() -> MobileConnectionConfig {
        guard
            let data = userDefaults.data(forKey: key)
        else {
            return .default
        }

        if let config = try? JSONDecoder().decode(MobileConnectionConfig.self, from: data) {
            return config
        }

        if let legacy = try? JSONDecoder().decode(BridgeConfig.self, from: data) {
            return MobileConnectionConfig(
                preferredMode: .direct,
                directBridge: legacy,
                relay: nil
            )
        }

        return .default
    }

    func save(_ config: MobileConnectionConfig) {
        guard let data = try? JSONEncoder().encode(config) else {
            return
        }
        userDefaults.set(data, forKey: key)
    }
}
