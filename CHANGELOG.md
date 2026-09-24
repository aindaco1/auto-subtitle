# Changelog

## Auto Subtitle 1.0.3

- Simplify diagnostic reporting labels and confirmations.
- Match the header button sizes and replace installed models' setup actions with
  Check installation. Keep the model sheet open after setup for optional repair.
- Place the optional Improve accuracy checkbox below Export format with visible
  same-language guidance. It remains off by default and unavailable for translations.

## Auto Subtitle 1.0.2

- Adopt Platform's native speech and Apple generation modules. Preserve verbatim
  subtitle policies, helper contracts, model verification, and FluidAudio 0.15.5.
  Build the same formatting helper through SwiftPM for the app and Jev evaluations.

- Format short continuous phrases before mapping punctuation back to each caption's
  exact words and timestamps, so a caption boundary need not become a sentence ending.
- Keep already capitalized, punctuated captions as written. Reject edits that remove
  or move existing punctuation, and retain standard output when a proposal is unsafe.
- Recover unsafe surface drafts with one selection among original-word options, and
  reject unrequested ALL CAPS while preserving existing acronym and name casing.
- Require calibrated Jev semantic checks together with exact punctuation and phrase
  checks before release; no private subtitles are sent to the evaluator.
- Validate both word and token timing evidence, reject invalid confidence values,
  and require strong confidence in the second recognition pass before applying
  spelling corrections or recovering missing dialogue.
- Bind formatting retry caches to the available Apple model metadata as well as the
  helper and OS. Expand public English/Spanish Jev tests for conditions, questions,
  negation and sentence continuations. Jev remains development-only.

These changes strengthen preservation and correction safeguards; they do not
upgrade the speech model or establish recognition accuracy across films.

## Auto Subtitle 1.0.1

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
