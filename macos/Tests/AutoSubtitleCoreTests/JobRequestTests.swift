import XCTest
@testable import AutoSubtitleCore

final class JobRequestTests: XCTestCase {
    func testTranslationNeverEnablesWordingChanges() throws {
        let job = JobRequest(mode: "align", video: "/movie.mkv", subtitle: "/draft.ass", format: "ass", cleanup: true, improve: true, language: "auto", stream: 2, translated: true)
        XCTAssertFalse(job.improve)
        XCTAssertFalse(job.repairLanguage)
        let data = try JSONEncoder().encode(job)
        let decoded = try JSONDecoder().decode(JobRequest.self, from: data)
        XCTAssertEqual(decoded.subtitle, "/draft.ass")
        XCTAssertEqual(decoded.stream, 2)
    }
    func testGenerateOmitsImportedSubtitleAndCorrection() {
        let job = JobRequest(mode: "generate", video: "/movie.mkv", subtitle: "/draft.srt", format: "srt", cleanup: true, improve: true, language: "es", stream: nil, translated: false)
        XCTAssertNil(job.subtitle); XCTAssertFalse(job.improve)
        XCTAssertTrue(job.repairLanguage)
    }
    func testLanguageRepairCanBeDisabledWithoutChangingSelectedLanguage() throws {
        let job = JobRequest(mode: "generate", video: "/movie.mkv", subtitle: nil, format: "srt", cleanup: true, improve: false, language: "es", stream: 1, translated: false, repairLanguage: false)
        let decoded = try JSONDecoder().decode(JobRequest.self, from: JSONEncoder().encode(job))
        XCTAssertFalse(decoded.repairLanguage); XCTAssertEqual(decoded.language, "es")
    }
}
