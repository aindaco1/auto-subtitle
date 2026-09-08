import SwiftUI
import AutoSubtitleCore

enum Theme {
    static let languages: [String] = {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("engine-root/resources/parakeet-capabilities.json"),
              let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        return object["languages"] as? [String] ?? []
    }()
    static func color(_ hex: UInt32) -> Color { Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255) }
    static let palette: [String: String] = {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("engine-root/resources/brand/dust-wave-v1.json"),
              let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object["colors"] as? [String: String] ?? [:]
    }()
    static func role(_ name: String) -> Color {
        guard let value = palette[name], let hex = UInt32(value.dropFirst(), radix: 16) else { return .primary }
        return color(hex)
    }
    static let cyan = role("cyan"), lightAccent = color(0x006578), background = role("background"), paper = role("paper")
}
struct MainWindow: View {
    @StateObject var model = AppModel()
    @StateObject var updates = AppUpdateController()
    @Environment(\.colorScheme) var scheme
    @State private var options = false
    @State private var hovering = false
    var accent: Color { scheme == .dark ? Theme.cyan : Theme.lightAccent }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Auto Subtitle").font(.system(size: 27, weight: .semibold))
                        Text("Subtitles, in time.").font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { model.showDiagnostics = true; model.prepareDiagnostic() } label: { Image(systemName: "questionmark.circle") }.help("Export current state or report a crash").accessibilityLabel("Help and diagnostics")
                    Button(action: updates.checkForUpdates) { Image(systemName: "arrow.down.circle") }
                        .help("Check for updates from official GitHub releases").accessibilityLabel("Check for updates")
                        .disabled(model.busy || model.diagnosticBusy || !updates.canCheckForUpdates)
                    Button { model.showModel = true } label: { Label(model.modelReady ? "Model ready" : "Speech model", systemImage: model.modelReady ? "checkmark.circle" : "arrow.down.circle") }.controlSize(.small)
                        .disabled(model.busy).help("Find, import or download the local Parakeet speech model")
                }
                Picker("Workflow", selection: $model.mode) { Text("Align subtitles").tag("align"); Text("Generate subtitles").tag("generate") }
                    .pickerStyle(.segmented).disabled(model.busy)
                VStack(alignment: .leading, spacing: 14) {
                    fileRow(title: "Video", url: model.video, symbol: "film", subtitle: "Drop a video or choose a file") { model.choose(subtitles: false) }
                    if model.mode == "align" {
                        Divider()
                        fileRow(title: "Subtitles", url: model.subtitle, symbol: "captions.bubble", subtitle: "Drop an SRT or ASS file") { model.choose(subtitles: true) }
                    }
                }.padding(18).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(hovering ? accent : Color.secondary.opacity(0.18), lineWidth: hovering ? 2 : 1))
                    .dropDestination(for: URL.self) { urls, _ in model.accept(urls); return !urls.isEmpty } isTargeted: { hovering = $0 }
                if model.tracks.count > 1 {
                    Picker("Audio track", selection: $model.stream) { ForEach(model.tracks) { Text($0.label).tag($0.index) } }.disabled(model.busy)
                }
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Picker("Export", selection: $model.format) { Text("SRT").tag("srt"); Text("ASS").tag("ass") }.frame(width: 180)
                        Spacer()
                        if model.mode == "align" { Toggle("Improve accuracy", isOn: $model.improve).disabled(model.translated).help("Check wording against the audio. Available for subtitles in the spoken language.") }
                    }
                    if model.mode == "align" {
                        Text(model.improve ? "Conservatively check wording against the audio." : "Fix timing while preserving wording and subtitle language.").font(.callout).foregroundStyle(.secondary)
                    } else { Text("Create subtitles in the spoken language using local Parakeet recognition.").font(.callout).foregroundStyle(.secondary) }
                    DisclosureGroup("Options", isExpanded: $options) {
                        VStack(alignment: .leading, spacing: 12) {
                            if model.mode == "align" {
                                Toggle("Clean up formatting", isOn: $model.cleanup)
                                Toggle("Subtitles are a translation", isOn: $model.translated).onChange(of: model.translated) { _, value in if value { model.improve = false } }
                                if model.translated { Text("Translations support timing and formatting; wording stays unchanged.").font(.caption).foregroundStyle(.secondary) }
                            }
                            if model.mode == "generate" || model.improve {
                                Picker("Audio language", selection: $model.language) {
                                    Text("Automatic").tag("auto")
                                    ForEach(Theme.languages, id: \.self) { code in Text(Locale.current.localizedString(forLanguageCode: code) ?? code).tag(code) }
                                }
                                Text("Parakeet detects language automatically. This choice guides language checks and local repair retries.").font(.caption).foregroundStyle(.secondary)
                                if model.mode == "generate" {
                                    Toggle("Repair language mismatches", isOn: $model.repairLanguage)
                                    Text("Checks suspicious passages with optional local Whisper. Uncertain wording stays unchanged and is flagged for review.").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }.padding(.top, 10)
                    }
                }.disabled(model.busy)
                if model.busy {
                    VStack(alignment: .leading, spacing: 9) {
                        HStack { Text(model.stage).font(.callout); Spacer(); Button("Cancel", action: model.cancel).keyboardShortcut(".", modifiers: .command) }
                        if let fraction = model.fraction { ProgressView(value: fraction) } else { ProgressView().controlSize(.small) }
                    }.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                if let error = model.error {
                    Label(error, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(scheme == .dark ? Color.orange : Color.brown).textSelection(.enabled)
                }
                if let result = model.result {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(result.summary ?? "Ready to save", systemImage: (result.unresolvedCount ?? 0) + (result.languageReviewCount ?? 0) > 0 ? "exclamationmark.circle" : "checkmark.circle").font(.headline)
                        ForEach(result.notices ?? [], id: \.self) { Text($0).font(.callout).foregroundStyle(.secondary) }
                        if let count = result.warningCount, count > 0 { Text("\(count) captions have readability notes in the report.").font(.caption).foregroundStyle(.secondary) }
                        HStack {
                            Button(model.saved == nil ? "Save subtitles…" : "Save another copy…", action: model.save).buttonStyle(.borderedProminent)
                            Button("Reveal in Finder", action: model.reveal)
                            Spacer()
                            Button("Local report", action: model.showReport).buttonStyle(.link).help("Contains subtitle text and local paths. Use Help & diagnostics to export a shareable report.")
                        }
                    }.padding(18).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                }
                HStack {
                    Label("Processed on this Mac", systemImage: "lock").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(model.mode == "align" ? "Align subtitles" : "Generate subtitles", action: model.start)
                        .buttonStyle(.borderedProminent).controlSize(.large).disabled(!model.canRun).keyboardShortcut(.return, modifiers: .command)
                }
            }.padding(24)
        }
        .background(scheme == .dark ? Theme.background : Theme.paper)
        .tint(accent).frame(minWidth: 620, idealWidth: 680, minHeight: 540)
        .sheet(isPresented: $model.showModel) { modelSheet }
        .sheet(isPresented: $model.showDiagnostics) { diagnosticsSheet }
        .task { updates.checkOnLaunch() }
        .onChange(of: model.busy || model.diagnosticBusy) { _, value in updates.busy = value }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("AutoSubtitleCheckForUpdates"))) { _ in updates.checkForUpdates() }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("AutoSubtitleDiagnostics"))) { _ in model.showDiagnostics = true; model.prepareDiagnostic() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in model.terminate() }
    }
    func fileRow(title: String, url: URL?, symbol: String, subtitle: String, choose: @escaping () -> Void) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 25)).foregroundStyle(accent).frame(width: 34)
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.headline); Text(url?.lastPathComponent ?? subtitle).font(.callout).foregroundStyle(.secondary).lineLimit(2).textSelection(.enabled) }
            Spacer(minLength: 8)
            Button(url == nil ? "Choose…" : "Change…", action: choose).disabled(model.busy).accessibilityLabel("Choose \(title.lowercased())")
        }.frame(minHeight: 58)
    }
    var modelSheet: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("Local speech models", systemImage: "waveform").font(.title2)
            Text("Parakeet supports speech recognition in 25 languages. Timing-only alignment works without a model.")
            Link("NVIDIA Parakeet · Fluid Inference Core ML conversion · CC BY 4.0", destination: URL(string: "https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml/tree/aed02740059203c4a87495924f685de3722ae9ce")!).font(.caption)
            Text(model.modelReady ? "The speech model is installed on this Mac." : "First look for an existing model. If none is available, download the verified Core ML model (about 483 MB).")
                .foregroundStyle(.secondary)
            if model.busy { Text(model.stage); if let fraction = model.fraction { ProgressView(value: fraction) } else { ProgressView() } }
            if let error = model.error { Text(error).font(.callout).foregroundStyle(.orange).textSelection(.enabled) }
            HStack { Button("Find existing", action: model.findModel); Button("Import existing…") { model.setupModel(importExisting: true) }; Button("Download") { model.setupModel(importExisting: false) }.buttonStyle(.borderedProminent) }.disabled(model.busy)
            Divider()
            Text("Language repair · optional").font(.headline)
            Text(model.whisperReady ? "Whisper Turbo is installed for checking suspicious passages." : "Whisper Turbo checks suspicious language changes. Find an existing copy or download the verified model (1.62 GB). Generation also works without it, with review notices.").font(.callout).foregroundStyle(.secondary)
            Link("OpenAI Whisper · whisper.cpp conversion · MIT", destination: URL(string: "https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1")!).font(.caption)
            HStack {
                Button("Find repair model") { model.setupWhisper(findOnly: true) }
                Button("Import repair model…") { model.setupWhisper(importExisting: true) }
                Button("Download repair model") { model.setupWhisper() }
            }.disabled(model.busy)
            HStack { Text("Models are verified before use. Your audio stays local.").font(.caption).foregroundStyle(.secondary); Spacer(); if model.busy { Button("Cancel", action: model.cancel) } else { Button("Done") { model.showModel = false }.keyboardShortcut(.defaultAction) } }
        }.padding(26).frame(width: 570)
    }
    var diagnosticsSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Help & diagnostics").font(.title2)
            Text("Review and send the current state for testing, or import an Auto Subtitle crash log. Reports contain app and system versions, processing options, and error categories.").font(.callout)
            Text("No filenames, paths, media, subtitle text, raw logs, or personal identifiers are included.").font(.callout).foregroundStyle(.secondary)
            ScrollView { Text(model.diagnosticPreview.isEmpty ? "Preparing snapshot…" : model.diagnosticPreview).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(12) }.frame(height: 250).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
            Text(model.diagnosticStatus).font(.callout)
            if let url = model.diagnosticIssueURL { Link("Open GitHub issue", destination: url) }
            HStack {
                Button("Refresh state") { model.prepareDiagnostic() }
                Button("Import crash log…") { model.prepareDiagnostic(importCrash: true) }
                Button("Export JSON…", action: model.exportDiagnostic).disabled(model.diagnosticPreview.isEmpty)
            }.disabled(model.diagnosticBusy)
            Button("Clear local job data…", action: model.clearLocalData).buttonStyle(.link).font(.caption).disabled(model.busy || model.diagnosticBusy)
            HStack {
                Text("Sending creates or updates an issue in aindaco1/auto-subtitle on GitHub.").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Send to GitHub", action: model.sendDiagnostic).buttonStyle(.borderedProminent).disabled(!model.diagnosticCanSend || model.diagnosticBusy)
                Button("Done") { model.showDiagnostics = false }.keyboardShortcut(.cancelAction)
            }
        }.padding(24).frame(width: 630)
    }
}
