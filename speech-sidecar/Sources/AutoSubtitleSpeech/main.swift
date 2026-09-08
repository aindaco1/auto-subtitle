import Foundation
import RecordSpeech
import NaturalLanguage
import AppKit

func emit(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data + Data([10]))
}

@main struct SpeechTool {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            let manifest = ParakeetModelManifest.v3
            if args.count == 2, args[0] == "languages" {
                let data = try Data(contentsOf: URL(fileURLWithPath: args[1]))
                guard data.count <= 8 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                let texts = try JSONDecoder().decode([String].self, from: data)
                guard texts.count <= 40000, texts.allSatisfy({ $0.count <= 2000 }) else { throw CocoaError(.fileReadTooLarge) }
                let recognizer = NLLanguageRecognizer()
                let scores = texts.map { text in
                    recognizer.reset()
                    recognizer.processString(text)
                    return Dictionary(uniqueKeysWithValues: recognizer.languageHypotheses(withMaximum: 3).map { ($0.key.rawValue, $0.value) })
                }
                try emit(scores)
                return
            }
            if args.count == 3, args[0] == "spelling" {
                let words = try JSONDecoder().decode([String].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
                guard let language = NSSpellChecker.shared.availableLanguages.first(where: { $0.replacingOccurrences(of: "_", with: "-").split(separator: "-").first == Substring(args[1]) }) else {
                    try emit(["available": false, "misspelled": [String]()]); return
                }
                let checker = NSSpellChecker.shared
                let misspelled = words.filter { checker.checkSpelling(of: $0, startingAt: 0, language: language, wrap: false, inSpellDocumentWithTag: 0, wordCount: nil).location != NSNotFound }
                try emit(["available": true, "misspelled": misspelled]); return
            }
            if args.count == 2, args[0] == "language" {
                let text = try String(contentsOfFile: args[1], encoding: .utf8)
                let recognizer = NLLanguageRecognizer()
                recognizer.processString(String(text.prefix(32000)))
                try emit(Dictionary(uniqueKeysWithValues: recognizer.languageHypotheses(withMaximum: 3).map { ($0.key.rawValue, $0.value) }))
                return
            }
            if args == ["manifest"] {
                try emit(["revision": manifest.sourceRevision, "folder": manifest.localFolderName,
                          "repository": "FluidInference/parakeet-tdt-0.6b-v3-coreml",
                          "bytes": manifest.byteCount,
                          "files": manifest.files.map { ["path": $0.path, "size": $0.size, "sha256": $0.sha256] }])
                return
            }
            if args == ["cache"] {
                try emit(["path": ParakeetTranscriber.defaultModelDirectory().path]); return
            }
            guard args.count == 3, args[0] == "transcribe" else {
                throw NSError(domain: "AutoSubtitle", code: 1, userInfo: [NSLocalizedDescriptionKey: "Usage: auto-subtitle-speech transcribe MODEL REQUEST.json"])
            }
            let modelURL = URL(fileURLWithPath: args[1])
            try ParakeetModelVerifier.validateV3(at: modelURL)
            RecordFluidAudioOfflinePolicy.enforce()
            let requests = try JSONDecoder().decode([Chunk].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
            let transcriber = ParakeetTranscriber()
            try await transcriber.prepare(modelDirectory: modelURL)
            for (index, chunk) in requests.enumerated() {
                let result = try await transcriber.transcribe(URL(fileURLWithPath: chunk.audio))
                let encoded = try JSONEncoder().encode(result)
                try encoded.write(to: URL(fileURLWithPath: chunk.output), options: [.atomic])
                try emit(["type": "chunk", "completed": index + 1, "total": requests.count])
            }
            await transcriber.release()
        } catch {
            FileHandle.standardError.write(Data("Speech recognition failed: \(error)\n".utf8))
            exit(1)
        }
    }
    struct Chunk: Decodable { let audio: String; let output: String }
}
