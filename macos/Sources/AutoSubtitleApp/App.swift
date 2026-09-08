import SwiftUI

@main struct AutoSubtitleApp: App {
    var body: some Scene {
        Window("Auto Subtitle", id: "main") { MainWindow() }
            .defaultSize(width: 680, height: 650)
            .commands {
                CommandGroup(replacing: .newItem) {}
                CommandGroup(after: .appInfo) { Button("Check for Updates…") { NotificationCenter.default.post(name: Notification.Name("AutoSubtitleCheckForUpdates"), object: nil) } }
                CommandGroup(replacing: .help) { Button("Help & diagnostics…") { NotificationCenter.default.post(name: Notification.Name("AutoSubtitleDiagnostics"), object: nil) } }
            }
    }
}
