<div align="center">

# dsh-agent-personality

**A personality for DeepSeek Harness that gets tired, remembers you, and starts conversations on its own**

[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](https://github.com/yimengsuper2432/dsh-agent-personality)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.2.0-informational.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

[中文](./README.md) · English

</div>

`dsh-agent-personality` turns a Markdown persona card into a character with an emotion meter that moves slowly across turns, its own worldview, a diary, a relationship network — and a voice that can open a conversation. It runs inside the normal DeepSeek Harness session pipeline: the persona is injected into the system prompt, the closing line is rendered to the right of the cost row, memory lives on disk, and proactive messages go through the host's schedule service.

## Why it exists

- **Emotion is a 0–100 variable, reset every morning.** Starts at 50 and resets to 50 at 06:00 local time (energy back to 100). It only moves with conversation: at most ±6 per turn and ±20 per day. Energy follows actual DSH workload (1–10 points per turn by token usage) and recovers 10 per hour after two idle hours. Five bands (0–19 cold, 20–39 distant, 40–59 neutral, 60–79 close, 80–100 devoted) change tone, sentence length and initiative. The evidence list expands to show exactly what moved it, and is cleared at boot.
- **Separate files for separate things.** `persona.md` (character), `worldview.md` (setting), `character.json` (sheet + relationships), `diary.json` (one line per turn), `knowledge.json` (pending / confirmed learning). Learning never rewrites the persona body — only the managed block at the end.
- **It studies only inside the domain you give it.** Fill one entry URL — the character's study site (e.g. `https://example.com/wiki`) — plus a few keywords. The plugin reads that page, then follows links, `sitemap` entries and list pages on **the same host**; for single-page sites it probes common detail paths (`/zh-cn/character/20`) and keeps only pages that mention the character. Up to four pages per run, stopping early on the token budget ("tokens per study run", in M; empty means unlimited). Everything it finds becomes a **pending summary it asks you about** — nothing is written into the persona card until you press "confirm" in Self-learning, and you can discard it instead. Voice-actor lines are filtered out.
- **The closing line sits next to the cost row.** The plugin takes over the ending: the body must not write a standalone farewell, and one closing line is generated after `turn/end`, then inserted into `dsh-cost-meter`'s `<summary>` in the same gray as the cost text.
- **It reaches out first.** Several random times a day (six by default), each one starts a real turn in the persona's own session, so she speaks without you saying anything first. The plan survives restarts.

## Install

> Requires DeepSeek Harness `0.2.0` or newer, plus a configured model.

Desktop: **Plugins → Add plugin**, paste

```text
https://github.com/yimengsuper2432/dsh-agent-personality.git
```

CLI:

```bash
dsh plugin --profile web add github:yimengsuper2432/dsh-agent-personality
dsh web
```

Then open **Settings → Personality & Emotion**. The plugin creates its data directory next to the workspace; nothing is written into the source tree.

## Quick start

1. Paste your persona card into **Character** and save it.
2. Fill in the worldview tab and add a few relationships.
3. Chat one turn — the closing line appears on the cost row and a diary entry is written.
4. In Self-learning, put the entry URL and keywords; a run leaves a pending summary and asks you in the persona session. Approve it and it is appended to the persona card.

## Prompt layers

```text
persona card
worldview
character sheet + relationships
known facts + nearest events
emotion variable (current band + directives for that band)
your own state (you get tired, you have opinions, remind the user to rest)
speech traits (applied last, highest priority)
closing line is owned by the plugin
```

## Workspace and session title

Settings → **Character workspace**: "pick a folder" (native Explorer dialog) or a manual absolute path, then "save workspace". New character sessions are created there.

The session title is fully user-defined: type it in the same card and press "save title" (leave it empty to fall back to Chinese name + English name). The **Agent mode** dropdown lists the presets installed in DSH, so the persona session can run in standard or PTC mode.

## Judgements run in a subagent

Everything that needs a decision is now thought through by a child agent the character spawns herself — the closing line, mood, affection delta and memory tagging after each turn; the proactive topics and her own daily routine; and how fetched research is split into worldview / character / relationship facts.

The child is a real host subagent (`ctx.subagents`) with its own session and a single reasoning pass; it returns only the result. Switching off "judgements in a subagent" in Settings, or a host without the `subagents` service, a child that fails to start, or a judgement timeout, falls back to a direct model call so nothing breaks.

Two hidden options: `judgeBySubagent` (default `true`) and `judgeProvider` (default `spawn`; `fork` lets the child judge with the current conversation in context). `POST /api/agent-personality-v1/judge-probe` runs one child on its own, and `judge.note` in the state payload records which path the last judgement took.

## Settings tabs

Five tabs: **Character / Memory / Relationships / Self-learning / Settings**.

- Character shows the emotion and energy bars (blue→pink, white→red) with an expandable evidence list, plus the persona card editor.
- Memory shows a 2000 KB capacity bar and the diary; when it fills up the oldest entries fade out first.
- Relationships draws the graph with the relation written next to each edge (click to edit) and a three-column table: name / group / notes, plus a single "+ add relationship".
- Worldview is its own tab with the same card styling as the persona card.
- Self-learning holds the work name, the study URL, the keywords, the token budget with its historical average, the pending summary (confirm / discard) and up to eight expandable confirmed rows you can delete.
- Settings keeps only two switches (self-learning, proactive chat), the workspace picker, the session-title field and the Agent mode dropdown; "status and paths" shows the data directory, persona path, worldview path and the day you started together.

## Data directory

```text
<workspace>/agent-personality/
├── persona.md        # character card (managed block at the end)
├── worldview.md      # setting (user + learned managed block)
├── character.json    # name / aliases / gender / appearance / hobbies / team / relationships
├── diary.json        # one entry per turn, max 500
├── knowledge.json    # pending / confirmed learning runs with token averages
├── emotion.json      # emotion 0..100, mood, energy, evidence, daily delta
├── config.json       # switches and pacing
├── closings.json     # closing cache keyed by sessionId:seq
├── schedule.json     # today's proactive plan
├── requests.json     # things it wants to ask you
└── last-boot.json    # last boot diagnostics
```

## The child process

After every completed turn a separate Node process (`persona-worker.js`) receives the turn result and rewrites only the managed block:

- append one dated, deduplicated memory line;
- rebuild the current mood / energy / affection block;
- atomic write with a `.bak` backup.

It never touches the rest of your file.

## Privacy

Everything stays in the local data directory. The only network calls are the host's model channel and the host's web service (search + page fetch; when the study URL itself exposes a public character-data endpoint, that data is read instead). Turn study off and no external request remains except model calls. Every page it read is listed in `knowledge.json` under `sources` and is visible in Settings.

## Development

`index.js` is the host half (prompt, emotion, diary, study, schedule, HTTP API under `/api/agent-personality-v1/*`), `client.js` the web half (turn tail closing line + four settings tabs), `persona-worker.js` the child process. The host does not hot-reload: toggle the plugin off/on after editing it; refresh the page after editing the client.

## License

MIT © 2026 SugarOriginal