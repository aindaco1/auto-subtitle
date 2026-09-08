import XCTest
@testable import AutoSubtitleCore

final class UpdatePolicyTests: XCTestCase {
    func testLaunchChecksOnceAndBusyDefersWithoutLosingCheck() {
        var policy = UpdatePolicy()
        XCTAssertFalse(policy.takeLaunchCheck(enabled: true, busy: true))
        XCTAssertTrue(policy.takeLaunchCheck(enabled: true, busy: false))
        XCTAssertFalse(policy.takeLaunchCheck(enabled: true, busy: false))
    }
    func testDisabledAutomaticChecksDoNotConsumeManualOrLaterEnabledPolicy() {
        var policy = UpdatePolicy()
        XCTAssertFalse(policy.takeLaunchCheck(enabled: false, busy: false))
        XCTAssertTrue(policy.takeLaunchCheck(enabled: true, busy: false))
    }
}
