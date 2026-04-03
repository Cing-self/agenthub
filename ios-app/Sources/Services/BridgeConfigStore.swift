import Foundation

struct BridgeConfigStore {
    private let key = "lobster-mobile.bridge-config"

    func load() -> BridgeConfig {
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let config = try? JSONDecoder().decode(BridgeConfig.self, from: data)
        else {
            return .default
        }
        return config
    }

    func save(_ config: BridgeConfig) {
        guard let data = try? JSONEncoder().encode(config) else {
            return
        }
        UserDefaults.standard.set(data, forKey: key)
    }
}
