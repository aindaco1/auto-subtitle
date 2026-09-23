# Auto Subtitle 1.0.1

- Improve English and Spanish line breaks with on-device Apple Intelligence and grammatical boundary checks, including translated subtitles. Requires macOS 26+ and an available Apple model; standard wrapping remains available on macOS 15+.
- Polish punctuation and capitalization automatically with cleanup when Apple Intelligence is available. Words, numbers and timestamps are preserved, and proposed changes are recorded in the Local report for review.
- Reuse completed formatting results on retries. Turning off cleanup skips Apple formatting.
- Fix continuous duplicate merging after wrapping, and count soft line breaks consistently in reading-speed warnings.
- Add calibrated Jev development evaluations using public synthetic English/Spanish SRT and ASS cases. Jev is not part of app processing.

Apple formatting adds processing time; this is a formatting-quality update. The small synthetic evaluation does not establish accuracy across films or minimum-device performance. Review subtitle playback before use.

# Auto Subtitle 1.0.0

First native release for Apple Silicon Macs running macOS 15 or later.

- Align SRT and ASS subtitles, including translations, with automatic offset and timing-rate correction.
- Generate captions locally with Parakeet and optionally repair suspicious language changes with verified local Whisper models.
- Find compatible installed models or download pinned, checksum-verified files directly in the app.
- Check for official signed GitHub updates at launch or from the top-right update button. Installation requires your action.
- Review, export or send privacy-filtered current-state and crash reports. Similar reports aggregate in GitHub issues.
- Preserve original files and write new subtitle exports.

Recognition can still make mistakes. Uncertain language passages retain their wording and are listed for review. Human review across all supported languages, translated cut differences, and minimum-memory hardware remains ongoing.
