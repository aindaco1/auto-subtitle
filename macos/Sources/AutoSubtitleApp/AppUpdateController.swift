import Combine
import Sparkle
import AutoSubtitleCore

/// Sparkle owns the feed, archive signature, replacement and relaunch.
@MainActor final class AppUpdateController: NSObject, ObservableObject, SPUUpdaterDelegate {
    @Published private(set) var canCheckForUpdates = false
    private var controller: SPUStandardUpdaterController!
    private var observation: AnyCancellable?
    private var policy = UpdatePolicy()
    private var pendingInstall: (() -> Void)?
    var busy = false {
        didSet {
            if !busy, let install = pendingInstall { pendingInstall = nil; install() }
        }
    }
    override init() {
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
        observation = controller.updater.publisher(for: \.canCheckForUpdates)
            .sink { [weak self] value in self?.canCheckForUpdates = value }
    }
    func checkOnLaunch() {
        if policy.takeLaunchCheck(enabled: controller.updater.automaticallyChecksForUpdates, busy: busy) {
            controller.updater.checkForUpdatesInBackground()
        }
    }
    func checkForUpdates() {
        guard !busy, canCheckForUpdates else { return }
        controller.checkForUpdates(nil)
    }
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        if busy { throw NSError(domain: "AutoSubtitle.Update", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Finish or cancel the current operation, then check for updates."]) }
    }
    func updater(_ updater: SPUUpdater, shouldPostponeRelaunchForUpdate item: SUAppcastItem,
                 untilInvokingBlock installHandler: @escaping () -> Void) -> Bool {
        guard busy else { return false }
        pendingInstall = installHandler
        return true
    }
}
