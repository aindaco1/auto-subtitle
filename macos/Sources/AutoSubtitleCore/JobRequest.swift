import Foundation

public struct JobRequest: Codable, Sendable {
    public var schema = 1
    public var mode: String
    public var video: String
    public var subtitle: String?
    public var format: String
    public var cleanup: Bool
    public var improve: Bool
    public var language: String
    public var stream: Int?
    public var translated: Bool
    public var repairLanguage: Bool
    public init(mode: String, video: String, subtitle: String?, format: String, cleanup: Bool,
                improve: Bool, language: String, stream: Int?, translated: Bool, repairLanguage: Bool = true) {
        self.mode = mode; self.video = video; self.subtitle = mode == "align" ? subtitle : nil
        self.format = format; self.cleanup = cleanup; self.improve = mode == "align" && !translated && improve
        self.language = language; self.stream = stream; self.translated = translated
        self.repairLanguage = mode == "generate" && repairLanguage
    }
}
public struct AudioTrack: Decodable, Identifiable, Sendable {
    public var id: Int { index }
    public let index: Int
    public let language: String
    public let title: String
    public let channels: Int?
    public var label: String { "Track \(index) · \(language.uppercased())" + (title.isEmpty ? "" : " · \(title)") }
}
public struct EngineEvent: Decodable, Sendable {
    public let type: String
    public let stage: String?
    public let fraction: Double?
    public let message: String?
    public let code: String?
    public let path: String?
    public let audio: [AudioTrack]?
    public let output: String?
    public let report: String?
    public let summary: String?
    public let notices: [String]?
    public let warningCount: Int?
    public let unresolvedCount: Int?
    public let languageReviewCount: Int?
    public let preview: String?
    public let canSend: Bool?
    public let issueURL: String?
    public let tool: String?
    public let signal: String?
    public let exitCode: Int?
}
