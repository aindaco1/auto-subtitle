/// One launch check; a busy app can defer it without consuming the attempt.
public struct UpdatePolicy {
    private var checked = false
    public init() {}
    public mutating func takeLaunchCheck(enabled: Bool, busy: Bool) -> Bool {
        guard enabled, !busy, !checked else { return false }
        checked = true
        return true
    }
}
