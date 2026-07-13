# Keep publisher tags Hub-only

When one GitHub URL installation yields at least two valid Skills, Skill Port assigns the GitHub owner as an immutable Hub-only publisher tag to each newly installed Skill. Tags match case-insensitively, retain source casing for display, support `sklp list --tag <owner>`, and never appear in catalog output; updates and skipped duplicate installs do not alter them. This preserves catalog privacy and stability while supporting publisher-based discovery.
