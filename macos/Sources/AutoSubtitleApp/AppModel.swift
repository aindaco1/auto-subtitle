import AppKit
import SwiftUI
import UniformTypeIdentifiers
import AutoSubtitleCore

@MainActor final class AppModel: ObservableObject {
    @Published var mode = "align"
    @Published var video: URL?
    @Published var subtitle: URL?
    @Published var format = "srt"
    @Published var cleanup = true
    @Published var improve = false
    @Published var translated = false
    @Published var language = "auto"
    @Published var repairLanguage = true
    @Published var whisperReady = false
    @Published var tracks: [AudioTrack] = []
    @Published var stream = -1
    @Published var busy = false
    @Published var stage = ""
    @Published var fraction: Double?
    @Published var error: String?
    @Published var result: EngineEvent?
    @Published var modelReady = false
    @Published var showModel = false
    @Published var saved: URL?
    @Published var showDiagnostics = false
    @Published var diagnosticPreview = ""
    @Published var diagnosticStatus = ""
    @Published var diagnosticBusy = false
    @Published var diagnosticCanSend = false
    @Published var diagnosticIssueURL: URL?
    private var diagnosticFile: URL?
    private var diagnosticProcess: Process?
    private var lastFailureCode = "none"
    private var lastTool = "none"
    private var lastSignal = "none"
    private var lastExitCode = -1
    private var interrupted = false
    private var cancelled = false
    private var process: Process?
    private var probeProcess: Process?
    private let root: URL
    private let work: URL

    init() {
        root = Bundle.main.resourceURL!.appendingPathComponent("engine-root")
        work = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Auto Subtitle")
        try? FileManager.default.createDirectory(at: work, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        modelReady = FileManager.default.fileExists(atPath: work.appendingPathComponent("Models/parakeet-tdt-0.6b-v3/parakeet_vocab.json").path)
        whisperReady = FileManager.default.fileExists(atPath: work.appendingPathComponent("Models/whisper-large-v3-turbo/ggml-large-v3-turbo.bin").path)
        if let data = try? Data(contentsOf: work.appendingPathComponent("last-state.json")),
           let previous = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let state = previous["state"] as? [String: Any], state["status"] as? String == "running" {
            interrupted = true; lastFailureCode = "INTERRUPTED"
            error = "The previous job stopped unexpectedly. You can retry it or export a diagnostic from Help."
        }
    }
    var canRun: Bool { !busy && video != nil && (mode == "generate" || subtitle != nil) }

    func choose(subtitles: Bool) {
        let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.allowsMultipleSelection = !subtitles
        if subtitles { panel.allowedContentTypes = [UTType(filenameExtension: "srt")!, UTType(filenameExtension: "ass")!] }
        present(panel) { [weak self] response in if response == .OK { self?.accept(panel.urls) } }
    }
    private func present(_ panel: NSSavePanel, completion: @escaping (NSApplication.ModalResponse) -> Void) {
        guard var window = NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain }) else {
            error = "Open the Auto Subtitle window and try choosing the file again."; return
        }
        while let sheet = window.attachedSheet { window = sheet }
        panel.beginSheetModal(for: window, completionHandler: completion)
    }
    func accept(_ urls: [URL]) {
        guard !busy else { return }
        error = nil; result = nil; saved = nil
        for url in urls {
            if ["srt", "ass"].contains(url.pathExtension.lowercased()) {
                subtitle = url; mode = "align"; format = url.pathExtension.lowercased()
            } else { video = url; inspectVideo(url) }
        }
    }
    private func inspectVideo(_ url: URL) {
        probeProcess?.terminate(); tracks = []; stream = -1
        probeProcess = launch(["probe", url.path], tracked: false) { [weak self] event in
            guard let self, self.video == url else { return }
            if let audio = event.audio { self.tracks = audio; self.stream = audio.first?.index ?? -1 }
            if event.type == "error" { self.error = event.message }
        }
    }
    func start() {
        guard canRun, let video else { return }
        result = nil; error = nil; saved = nil
        cancelled = false; interrupted = false; lastFailureCode = "none"; lastTool = "none"; lastSignal = "none"; lastExitCode = -1
        let request = JobRequest(mode: mode, video: video.path, subtitle: subtitle?.path, format: format,
                                 cleanup: cleanup, improve: improve, language: language,
                                 stream: stream < 0 ? nil : stream, translated: translated, repairLanguage: repairLanguage)
        let url = work.appendingPathComponent("request-\(UUID().uuidString).json")
        do {
            try JSONEncoder().encode(request).write(to: url, options: [.atomic])
            busy = true; stage = "Starting…"; fraction = nil
            persistState()
            process = launch(["run", url.path], tracked: true) { [weak self] event in self?.receive(event) }
        } catch { self.error = error.localizedDescription; busy = false }
    }
    func setupModel(importExisting: Bool) {
        if importExisting {
            let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false
            panel.message = "Choose the folder containing the Core ML Parakeet v3 model."
            present(panel) { [weak self] response in
                if response == .OK, let url = panel.url { self?.installModel(source: url) }
            }
        } else { installModel(source: nil) }
    }
    private func installModel(source: URL?) {
        let args = ["model-install"] + (source.map { [$0.path] } ?? [])
        let importExisting = source != nil
        busy = true; stage = importExisting ? "Verifying model…" : "Downloading model…"; fraction = nil; error = nil
        process = launch(args, tracked: true) { [weak self] event in self?.receive(event) }
    }
    func findModel() {
        busy = true; stage = "Looking for a compatible local model…"; fraction = nil; error = nil
        process = launch(["model-status"], tracked: true) { [weak self] event in self?.receive(event) }
    }
    func setupWhisper(findOnly: Bool = false, importExisting: Bool = false) {
        if importExisting {
            let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = true
            panel.message = "Choose the Whisper large-v3-turbo GGML file or its folder. Only the verified model is accepted."
            present(panel) { [weak self] response in
                if response == .OK, let url = panel.url { self?.installWhisper(findOnly: false, source: url) }
            }
        } else { installWhisper(findOnly: findOnly, source: nil) }
    }
    private func installWhisper(findOnly: Bool, source: URL?) {
        let args = [findOnly ? "whisper-status" : "whisper-install"] + (source.map { [$0.path] } ?? [])
        busy = true; stage = findOnly ? "Looking for a language repair model…" : "Setting up language repair model…"; fraction = nil; error = nil
        process = launch(args, tracked: true) { [weak self] event in self?.receive(event) }
    }
    private func receive(_ event: EngineEvent) {
        switch event.type {
        case "progress": stage = event.stage ?? "Processing…"; fraction = event.fraction
        case "error": error = event.message; lastFailureCode = cancelled ? "CANCELLED" : event.code ?? "PROCESSING_FAILED"; lastTool = event.tool ?? "none"; lastSignal = event.signal ?? "none"; lastExitCode = event.exitCode ?? -1; if event.code == "MODEL_MISSING" { showModel = true; modelReady = false }
        case "result": result = event; stage = event.summary ?? "Ready to save"; fraction = 1; whisperReady = FileManager.default.fileExists(atPath: work.appendingPathComponent("Models/whisper-large-v3-turbo/ggml-large-v3-turbo.bin").path)
        case "model": modelReady = event.path != nil; if modelReady { showModel = false; stage = "Speech model ready" } else { stage = "No compatible model found. Import one or download below." }
        case "whisper-model": whisperReady = event.path != nil; stage = whisperReady ? "Language repair model ready" : "No compatible language repair model found. Import one or download below."
        default: break
        }
        persistState()
    }
    func cancel() { cancelled = true; lastFailureCode = "CANCELLED"; stage = "Cancelling…"; process?.terminate(); persistState() }
    func terminate() { cancelled = busy; persistState(); process?.terminate(); probeProcess?.terminate(); diagnosticProcess?.terminate() }
    func save() {
        guard let source = result?.output else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [UTType(filenameExtension: format)!]
        panel.nameFieldStringValue = (video?.deletingPathExtension().lastPathComponent ?? "Subtitles") + (mode == "align" ? ".aligned." : ".subtitles.") + format
        present(panel) { [weak self] response in
            guard response == .OK, let destination = panel.url else { return }
            do {
                guard !FileManager.default.fileExists(atPath: destination.path) else { throw CocoaError(.fileWriteFileExists) }
                try FileManager.default.copyItem(atPath: source, toPath: destination.path); self?.saved = destination
            } catch { self?.error = "Could not save the file. Choose a new filename. \(error.localizedDescription)" }
        }
    }
    func reveal() {
        guard let url = saved ?? result?.output.map({ URL(fileURLWithPath: $0) }) else { return }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
    func showReport() { if let report = result?.report { NSWorkspace.shared.open(URL(fileURLWithPath: report)) } }

    private func stateSnapshot() -> [String: Any] {
        let phase: String
        if stage.localizedCaseInsensitiveContains("timing") || stage.localizedCaseInsensitiveContains("activity") { phase = "timing" }
        else if stage.localizedCaseInsensitiveContains("wording") { phase = "wording" }
        else if stage.localizedCaseInsensitiveContains("speech") { phase = "speech" }
        else if stage.localizedCaseInsensitiveContains("model") { phase = "model" }
        else if stage.localizedCaseInsensitiveContains("subtitle") { phase = "export" }
        else { phase = busy ? "starting" : "idle" }
        let status = interrupted ? "interrupted" : cancelled ? "cancelled" : error != nil ? "failed" : result != nil ? "completed" : busy ? "running" : "idle"
        let os = ProcessInfo.processInfo.operatingSystemVersion
        return ["application": ["version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0", "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0", "operatingSystem": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)", "architecture": "arm64"],
                "state": ["mode": mode, "phase": phase, "status": status, "format": format, "cleanup": cleanup, "improve": improve, "translated": translated, "modelInstalled": modelReady, "errorCode": lastFailureCode,
                          "videoType": video?.pathExtension.lowercased() ?? "none", "subtitleType": subtitle?.pathExtension.lowercased() ?? "none", "progressBucket": fraction.map { Int(max(0, min(1, $0)) * 10) } ?? -1, "tool": lastTool, "signal": lastSignal, "exitCode": lastExitCode]]
    }
    private func persistState() {
        if let data = try? JSONSerialization.data(withJSONObject: stateSnapshot(), options: [.sortedKeys]) {
            try? data.write(to: work.appendingPathComponent("last-state.json"), options: [.atomic])
        }
    }
    func prepareDiagnostic(importCrash: Bool = false) {
        if importCrash {
            let panel = NSOpenPanel(); panel.allowedContentTypes = [UTType(filenameExtension: "ips") ?? .data]
            panel.canChooseFiles = true; panel.canChooseDirectories = false
            panel.message = "Choose an Auto Subtitle crash log. Only allowlisted crash facts will be included."
            present(panel) { [weak self] response in
                if response == .OK, let url = panel.url { self?.prepareDiagnostic(incident: url) }
            }
        } else { prepareDiagnostic(incident: nil) }
    }
    private func prepareDiagnostic(incident: URL?) {
        let input = work.appendingPathComponent("diagnostic-input.json")
        do { try JSONSerialization.data(withJSONObject: stateSnapshot()).write(to: input, options: [.atomic]) }
        catch { diagnosticStatus = "Could not prepare a diagnostic."; return }
        diagnosticBusy = true; diagnosticStatus = "Preparing a privacy-filtered snapshot…"; diagnosticIssueURL = nil
        var args = ["diagnostic", input.path]; if let incident { args.append(incident.path) }
        diagnosticProcess = launch(args, tracked: false, finished: { [weak self] in self?.diagnosticBusy = false }) { [weak self] event in
            guard let self else { return }
            if event.type == "diagnostic", let output = event.output {
                self.diagnosticFile = URL(fileURLWithPath: output); self.diagnosticPreview = event.preview ?? ""
                self.diagnosticCanSend = event.canSend == true
                self.diagnosticStatus = "Review exactly what will be exported or sent."
            } else if event.type == "error" { self.diagnosticStatus = event.message ?? "Could not prepare a diagnostic." }
        }
    }
    func exportDiagnostic() {
        guard let source = diagnosticFile else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "Auto Subtitle Diagnostic.json"
        present(panel) { [weak self] response in
            guard response == .OK, let destination = panel.url else { return }
            do { try FileManager.default.copyItem(at: source, to: destination); self?.diagnosticStatus = "Exported locally. You can send this JSON file to the developer." }
            catch { self?.diagnosticStatus = "Choose a new filename to save the diagnostic." }
        }
    }
    func clearLocalData() {
        guard !busy, !diagnosticBusy else { return }
        let manager = FileManager.default, jobs = work.appendingPathComponent("Jobs")
        for folder in (try? manager.contentsOfDirectory(at: jobs, includingPropertiesForKeys: nil)) ?? [] {
            if let value = try? String(contentsOf: folder.appendingPathComponent("running.lock"), encoding: .utf8),
               let pid = Int32(value), pid > 0, kill(pid, 0) == 0 {
                diagnosticStatus = "Another subtitle job is running. Wait for it before clearing local data."; return
            }
        }
        let alert = NSAlert(); alert.messageText = "Move local job data to the Trash?"
        alert.informativeText = "Save any subtitles you want to keep first. This clears checkpoints, unsaved results and diagnostic snapshots. Original files, saved exports and the speech model stay in place."
        alert.addButton(withTitle: "Move to Trash"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do {
            let files = try manager.contentsOfDirectory(at: work, includingPropertiesForKeys: nil)
            for file in files where ["Jobs", "Diagnostics", "diagnostic-input.json"].contains(file.lastPathComponent) || file.lastPathComponent.hasPrefix("request-") {
                try manager.trashItem(at: file, resultingItemURL: nil)
            }
            result = nil; diagnosticFile = nil; diagnosticPreview = ""; diagnosticCanSend = false
            diagnosticStatus = "Local job data moved to the Trash. Originals and the speech model are unchanged."
        } catch { diagnosticStatus = "Some local data could not be moved to the Trash. \(error.localizedDescription)" }
    }
    func sendDiagnostic() {
        guard let file = diagnosticFile, diagnosticCanSend, !diagnosticBusy else { return }
        diagnosticBusy = true; diagnosticStatus = "Sending the reviewed report…"
        diagnosticProcess = launch(["send-report", file.path], tracked: false, finished: { [weak self] in self?.diagnosticBusy = false }) { [weak self] event in
            guard let self else { return }
            if event.type == "report-receipt", let address = event.issueURL {
                self.diagnosticIssueURL = URL(string: address); self.diagnosticCanSend = false; self.diagnosticStatus = event.summary ?? "Report accepted."
            } else if event.type == "error" { self.diagnosticStatus = event.message ?? "Report delivery was not confirmed. Retry later." }
        }
    }

    private func launch(_ args: [String], tracked: Bool, finished: @escaping @MainActor @Sendable () -> Void = {}, event: @escaping @MainActor @Sendable (EngineEvent) -> Void) -> Process? {
        let child = Process(), pipe = Pipe(), stderr = Pipe()
        child.executableURL = root.appendingPathComponent("runtime/macos-arm64/bin/node")
        child.arguments = [root.appendingPathComponent("engine/cli.mjs").path] + args
        child.standardOutput = pipe; child.standardError = stderr
        child.environment = ["HOME": FileManager.default.homeDirectoryForCurrentUser.path, "PATH": "/usr/bin:/bin", "LANG": "en_US.UTF-8"]
        stderr.fileHandleForReading.readabilityHandler = { handle in _ = handle.availableData }
        do { try child.run() } catch {
            let message = "The bundled engine could not start: \(error.localizedDescription)"
            if tracked { self.error = message; busy = false; lastFailureCode = "PROCESSING_FAILED"; lastTool = "engine"; persistState() }
            else { diagnosticStatus = message }
            finished(); return nil
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            var buffer = Data()
            while true {
                let data = pipe.fileHandleForReading.availableData
                if data.isEmpty { break }
                buffer.append(data)
                while let index = buffer.firstIndex(of: 10) {
                    let line = buffer.prefix(upTo: index); buffer.removeSubrange(...index)
                    if let value = try? JSONDecoder().decode(EngineEvent.self, from: line) { Task { @MainActor in event(value) } }
                }
            }
            child.waitUntilExit()
            stderr.fileHandleForReading.readabilityHandler = nil
            Task { @MainActor [weak self] in
                finished()
                guard let self, tracked else { return }
                self.busy = false; self.process = nil
                if child.terminationStatus != 0 && self.error == nil { self.error = "Processing stopped. Retry to resume completed speech chunks." }
                self.persistState()
            }
        }
        return child
    }
}
