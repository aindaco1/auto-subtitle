# Privacy and testing reports

Audio, video, subtitles, speech activity, recognized words, and change audits stay on the Mac. Network access occurs for GitHub update checks/downloads, explicit model setup, explicit report submission, or a user-opened source/issue link. Sparkle checks the official release feed quietly at launch; installation requires user action. Its system profiling and automatic installation are disabled.

**Help & diagnostics → Export JSON** works with or without a crash. The preview is the exact exported document. It includes only app/build/OS versions, architecture, workflow mode/phase/status, broad file types, processing flags, a coarse progress bucket, and bounded error/tool/signal/exit categories. Its random report ID supports deduplicated retry; it is not a user/device identifier.

**Import crash log** accepts this app's `.ips` file up to 2 MB. Only an approved exception, signal, image name, bounded image offset and numeric incident app/build/OS versions survive projection. Filenames, paths, media hashes, raw logs, stack symbols, incident IDs, environment variables, credentials, subtitle text and account information are discarded. Client and server reject unknown fields. No report is sent automatically. Current-state snapshots can be exported locally or explicitly sent after review. When importing an older crash, incident versions come from the crash; the processing settings describe the current app state and do not affect native-crash grouping.

**Send to GitHub** submits a reviewed current-state/failure/interruption/crash projection (maximum 4 KiB) to `https://crash.dustwave.xyz/v1/auto-subtitle/reports`. The existing ASCII VJ Crash Relay creates or aggregates issues only in `aindaco1/auto-subtitle`. GitHub credentials stay in the relay. The provider receives ordinary connection metadata for abuse prevention; it is not copied into issue content. Issue visibility follows the repository's visibility. Current-state and workflow reports receive diagnostic labels; native incidents receive crash labels.

The shared Durable Object handler serializes identical fingerprints, counts a report ID once, and retains uncertain deliveries for retry. The client displays success only after a bounded matching receipt. Refresh creates a new snapshot/ID; retrying the same displayed report preserves its ID. The owner-authorized release test created synthetic issues [#2](https://github.com/aindaco1/auto-subtitle/issues/2) and [#3](https://github.com/aindaco1/auto-subtitle/issues/3), verified aggregation and duplicate handling, and closed both. No real user logs or media were sent.

Local data lives in `~/Library/Application Support/Auto Subtitle/`:

- `Models/`: verified reusable model installation.
- `Jobs/`: media identities, input paths/settings, speech checkpoints and subtitle/change reports. Language audits and repair reports include before/after wording, timestamps, detected languages and retry reasons; these are private and never included in the public diagnostic projection. Whisper retry checkpoints follow the same policy. Completed chunk audio is removed; interrupted preparation may leave temporary audio for retry.
- `Diagnostics/`: reviewed filtered snapshots, retained for explicit export/retry.
- `last-state.json`: safe state projection used to detect interrupted work.

Use **Help & diagnostics → Clear local job data** after saving wanted outputs. The app moves job/checkpoint/diagnostic folders to the Trash. Imported originals and files saved outside app storage are untouched. Models remain available. Automatic age-based eviction is not enabled for the first testing candidate, so unsaved results are not silently discarded.

Repository access was added by the owner and verified alongside the existing three repositories. Both local serialized-grouping tests and live GitHub creation/update/duplicate receipts have been exercised. Release evidence records the deployed Worker revision; the relay remains independent of the app's update/signing credentials.
