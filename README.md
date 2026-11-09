# Stacy Chess — v12 (engine start-up fix, real piece sets, once-a-day ratings, beginner course, opening study guides, free Multiplayer)

A static, mobile-first chess coach and training app. This is an upgrade of the existing file-only app, not a rebuild or repository project. No build, paid API or package installation is required. A login is needed only for Multiplayer; everything else stays local and offline as before. Ratings, bot strengths, analysis accuracy and improvement projections are not guarantees.

## Open it in Koder

1. Extract **every file from the ZIP into the same folder**, retaining filenames.
2. Open `index.html` through Koder's web preview or any static HTTP server. v9 bundles the rules (chess.js) and the engine (Stockfish 19 Lite), so no internet is needed for play or review. Opening `index.html` straight from the file system (`file://`) is not supported for the engine: browsers block workers/WebAssembly there, so the app falls back to Stacy Lite and grades nothing. If moves are not graded, open **Settings → Engine check** and use **Copy report**.
3. On the upgrade welcome screen, export existing browser progress before choosing **Start fresh**. Explicitly acknowledge erasure. Alternatively retain progress.
4. A saved Gemini key is kept unless you tick its removal option. Existing AI/voice privacy toggles are retained when keeping a key. Exported progress does not contain the key.
5. First setup follows: **name → optional public Chess.com profile → latest available-game analysis → goal and coach preferences → personal plan**.

Browser storage belongs to an origin. Koder preview, Safari and a hosted copy may have different storage. The ZIP contains source, not your old browser progress. A manifest is included, but there is no service worker or guaranteed cold-start offline support.

## v12 · what changed

**1. Engine on iPhone ("moves aren't being graded").** v11 had one start path: a Worker loading
`engine/stockfish-19-lite.js`, which then streamed the `.wasm`. If the local server (Koder/Safari preview)
sent the wrong MIME type, resolved the worker path differently under `/Local/<folder>/`, had a damaged
file from the import, or the worker was slow, the engine silently fell back to Stacy Lite, and Stacy Lite
grades nothing. v12 tries these in order and records each attempt:
1. **wasm via Blob:** the page itself fetches the `.wasm`. It checks the status, `Content-Type`, size (1,845,971 bytes),
   the `\0asm` magic bytes and `WebAssembly.validate`, then starts the worker from a Blob, so server MIME types and
   worker paths no longer matter.
2. **wasm from file:** the v11 path. The loader now falls back from streaming to ArrayBuffer when the MIME type is wrong.
3. **asm.js via Blob**, then 4. **asm.js from file:** `engine/stockfish-19-asm.js` is a second, slower Stockfish 19 build
   that needs no WebAssembly at all. It still grades every move; searches get more time.
5. **Stacy Lite:** the last resort, labelled "not graded".

Each WebAssembly attempt gets 25 s and each asm.js attempt 45 s. The screen shows "Loading the chess
engine… (first start can take up to 30 s on a phone)". A worker error fails an attempt at once instead of
waiting for the timeout. On phones the hash is 8 MB (16 MB elsewhere).
**Settings → Engine check** (also in the menu) shows the cause on one screen: which build is running and how,
every fetch (status, Content-Type, bytes, magic bytes, validate), every attempt with its error and time,
SIMD/WebAssembly/Worker/Blob support, and the page URL. **Copy report** puts the full text on the clipboard.

**2. Pieces.** Stacy Geo and Stacy Block are removed. Anyone who used them is moved to Classic once.
New sets are bundled locally from lichess (lila), with each licence checked and copied into `LICENSES/`:

| Set | Author | Licence |
|---|---|---|
| Classic (cburnett) | Colin M.L. Burnett | GPLv2+ (also CC BY-SA 3.0) |
| Merida | Armando Hernandez Marroquin | GPLv2+ |
| Chessnut | Alexis Luengas | Apache 2.0 |
| Pirouetti | pirouetti | AGPLv3+ |
| Fantasy, Celtic, Spatial | Maurizio Monge | MIT |

Credits are in Customize and in THIRD_PARTY.md.

**3. Ratings change once per day.** Puzzles, games and lessons only *record* results during the day; the badge says
"counts toward today's session". The tactics and Stacy ratings move once, when the daily session is finished. If the
session was abandoned, they move at the next day's first start. Each change is capped at ±25, and one summary shows
what changed and why. Existing ratings are kept.

**4. "Today" crash (`Cannot set properties of null (setting 'onclick')` on `#goPlan`).** Root cause: a plan whose
*current* step was already marked complete rendered no Continue button, but the code still attached a click
handler to it. Fixes:
- the plan is normalised (it moves to the next open step, or is marked complete);
- the button is always rendered;
- all 47 `querySelector(...).onclick =` patterns now use a guarded `App.q`, which logs a miss instead of crashing.

**5. "How much chess do you know?"** The question comes on first run, and from Settings at any time without
resetting anything:
- **Brand new:** *Chess from zero* has 17 short interactive lessons: the board, each piece with tap-to-move
  exercises, captures, check, checkmate and stalemate, castling, en passant, promotion, piece values, the K+Q and
  K+R mates (Stacy defends with the real engine) and opening principles. Progress is saved, then it hands over to
  the easiest bot (Sprout) and the plans. The starting level is 400.
- **I know the rules:** a 5-puzzle placement sets the starting level (400–1300), then a basics track follows.
- **I already play:** the existing flow. Chess.com linking stays optional everywhere; without it the hubs use
  in-app games.

**6. Opening study guides.** Every course now has:
- plans for both sides, typical middlegame structures, typical mistakes, and traps for and against you;
- 16 new lines (2 per course), so each course has 4+ lines with explained main lines and sidelines;
- a live "Check with Stockfish" button;
- drills through the existing stages: Practice and Test are played from memory, and spaced reviews follow. The sidelines start like the main line and then change, which trains you to answer deviations.

All 36 lines and 9 traps were replayed with chess.js and checked with the bundled Stockfish (depth 13):
every learner move is within 80 centipawns of best. Two lines were corrected: scandi-qd6 8.Re1 became 8.Be3,
and in the new caro-two-knights line 11.Qe2 became 11.Qh4. Line ids and your progress are kept; new lines
change the completion percentage.

**7. Multiplayer, free mode (default).** It runs on Firebase's free Spark plan: no billing, no Cloud Functions.
- Accounts are a username and password; a hidden `<username>@users.stacy-chess.invalid` address is used behind the scenes.
- Firestore rules referee the turns, the move list, the clocks (server time) and the results.
- Both apps check chess legality, and a wrong move or claim stops the game as "disputed".
- There is no password reset in free mode: lose the password = lose that Multiplayer account. Local progress is never affected.

Setup is in `stacy-multiplayer-free-setup.zip` (phone-only console steps). Edit only `firebase-config.js`:
paste the Web API key and keep `mode: 'free'`. The Blaze backend (`stacy-multiplayer-backend.zip`) is still
available as `mode: 'strict'`. Nothing was deployed.

New files: `basics.js`, `openings-v12.js`, `multiplayer-free.js`, `engine/stockfish-19-asm.js`, `pieces/`, `LICENSES/`.

## What changed

### R3.1 targeted phone and learning fixes

- **Choose any number of learning needs:** 13 grouped, touch-friendly checkboxes plus Select all and an optional “I’m not sure” balanced-foundations choice. The original five keys migrate to arrays without a reset; a legacy primary key is retained. Choices are preferences, not claimed diagnoses. One focused activity rotates deterministically by local calendar date; all 13 choices take 13 dates for a full focused cycle. The other four activities remain, so daily plans still have exactly five steps. Available game/practice evidence and time/goal preferences tune content; weekly previews label planned rotation separately from measured results. Kept plans remain unchanged until explicit rebuild or normal next-day regeneration.
- New beginner needs cover opponent threats, free-piece losses, basic mates, development, king safety, planning, rushing and trades. They use real existing safety/puzzle/opening/endgame/calculation controllers. Planning/development/trades include authored legal short examples; planning and trading are introductions plus practical exercises, not advertised as complete strategy courses. Rushing uses the existing slow-scan timer.
- **Larger phone training boards:** lessons use a stable 56–76px scrolling coach region, collapse empty metadata/sidebar slots, shorten oversized badges, and compact Today’s heading/counter. “Why” opens the full explanation without consuming board space. Game coaching has its own larger fixed budget. Actual `visualViewport` height is applied to the board screen. Pixel acceptance still requires device testing; no iPhone rendering was verified in the automated harness.
- **Interactive Learn:** play your own highlighted moves by tapping/dragging; the opponent’s explained moves replay with pacing and stop on your turn. Wrong or illegal learning attempts are gently rejected without penalty. No quiz is introduced. Both colours, exact resume and cancellation are supported.
- **No simplifier dead end:** literal built-in explanations open a separate scrolling sheet with a permanently visible Back to lesson / Continue control. The original note, actions, position and arrows are not replaced. Learn/guided replies wait for return; live bot games pause and resume only if this sheet paused them. Leaving discards deferred work. Optional stale AI rewrites cannot overwrite a newer position or speak after the lesson is cleared. Simplifying itself makes no AI request.

### Stable board geometry

Phone board size is calculated from available viewport/stage bounds and reserved layout slots, not coach text height. The coach occupies a consistent viewport-scaled slot with internal scrolling. Long messages, guard actions, generated text loading and simplifications stay inside it or use sheets. The resize observer watches the available view rather than speech content. Square boards, bounded metadata, horizontally scrolling controls, safe-area padding and a landscape game layout preserve access to controls. “More”, bot chat, move history and review summaries open overlays instead of enlarging the board.

### Ordered first-run setup and editable goals

The welcome screen never silently deletes progress. Fresh start is explicit and available later in Settings → Reset. Reset acceptance is stored, so opening the app again does not reset it again.

Public-profile linking needs a **username only**, not a password or account-control permission. The actual Chess.com rapid/blitz/bullet rating is explicitly labeled. The latest **30 available eligible finished standard games** are selected, newest first, without substituting older games to manufacture balanced results. Import examines up to 24 recent archives and collects up to 60 eligible records before selecting 30. If fewer are available or the API fails, the screen says so. Baseline analysis samples up to 12 own decisions per game at phone-friendly budgets, saves per position, and resumes while the app is open. It is not a deep analysis of every move, nor Chess.com's proprietary accuracy. Goal setup follows completion or an honestly reported failure/partial result.

Goals are user-chosen, not fixed to 1500 or automatically +200. Preferences include current self-reported level when no account is available, desired rating, experience, practice budget, selected learning needs, habit, White/Black repertoire, calm/direct/reflective personality and guided/balanced/independent game help. Editing preferences only replaces an unfinished plan when its rebuild checkbox is selected. Self-reported level, actual account rating and independent in-app Elo stay separate. Nothing writes to Chess.com or Lichess.

### One sequential opening path

Eight courses: King's Indian Attack, London System, King's Indian Defence, Caro-Kann, Italian, Scotch, Queen's Gambit and Scandinavian. There are 20 main lines and 8 authored trap/common-mistake examples. All 28 SAN sequences were checked with chess.js 0.10.3.

Each opening has one **Continue learning** path with five stages: 1 Learn → 2 Guided → 3 Independent check → **4 Middlegame plan (guided)** → 5 Optional independent checkpoint. Later variations unlock after the preceding line's stage 4 (or a legacy completed transfer).

**Stage 4 · Opening → middlegame bridge (v4).** After the last book move you play 4 middlegame moves against real bot replies. Every turn shows a 5-step routine: opponent threats → your checks/captures → worst piece → plan + candidate → blunder check. Each of the 20 lines has its own authored plan in `middlegame.js`: structure, counterplay, 2–3 candidate ideas (re-checked for legality every turn, so deviations are handled), pawn breaks, common mistakes and what to do if the opponent deviates. "Plan & candidates" and "Show arrows" are optional. Your own good moves are accepted. When a deep-enough engine result exists, only a clear blunder (≥15% estimated win-chance loss) is sent back for another try, with no penalty. Without a reliable engine the move is accepted and marked ungraded. Ideas are never claimed as "best". Stage 4 is recorded as **assisted** evidence (weekly effort only, no SRS or mastery score).

**Stage 5** is optional and has no help. Tapping **Help me plan** switches that attempt to assisted: the plan and arrows appear, and the attempt is recorded as assisted practice. It can never become an unaided pass. Only an unaided pass earns a weekly opening score. Migration: legacy completed transfers stay complete and keep later branches unlocked. Phase IDs learn/guided/test/transfer are unchanged; `bridge` is new. An unfinished pre-v4 transfer snapshot is kept under `legacyTransferSnapshots` and the learner is routed to stage 4 first. Deep links and Today use the same gates. Completed stages can be revisited. Ordinary lessons and Today save unfinished positions.

Each chapter introduces up to 8 plies (half-moves):

1. **Learn** — arrows and the reason for each move, play the highlighted move on your turns; opponent replies play automatically with explanations. No interrupting quiz and no penalty for a learning retry.
2. **Guided** — make your side's moves, with optional explanation/hint.
3. **Independent** — no arrows, move dots, answers, live engine coaching or chat help. Wrong moves are rejected without changing the position; try again. A run containing a mistake cannot earn clean mastery. Restart for an error-free complete run. Failed runs retain their mistake state across resume.
4. A clean chapter expands the next Learn/Guided/Independent cycle by up to 8 plies, until the whole selected line is independently recalled. Then **Transfer** asks for 8 decisions against an appropriate bot, with no advice during the attempt and review afterwards.

Opening tests check a selected repertoire, not every sound chess alternative. A rejected legal move is not automatically called a chess blunder. Transfer comparisons are engine estimates, not a proof of understanding. Independent successes schedule spaced revisits; old `learned` progress never silently becomes new independent mastery.

### Twelve fictional bots, text chat and avatars

Sprout ~100, Twig ~250, Dot ~400, Pip ~600, Moss ~800, June ~1000, Rook ~1200, Sage ~1350, Nova ~1500, Atlas ~1750, Quill ~2100 and Vega ~2500. Generic Stacy difficulty remains available.

Personas differ in search skill/depth/time, book choices, preferences among close candidates and deliberate low-level inaccuracies. Strong bots have no deliberate random blunder probability. Fast/medium/slow thinking pace is visibly non-instant; pause and token guards cancel stale responses. Every bot has original embedded SVG art and rate-limited, game-reactive **text-only built-in chat**. Simple typed replies are template-based, not unrestricted AI. Bot chat never calls speech or Gemini. Coach speech remains separately configurable. Bot identity, pacing and chat history survive game saves; rematches/results preserve identity.

Strength labels are approximate and uncalibrated, not certified titles. “Grandmaster-strength” is a target label with the full engine, not a claim about a person. Lite fallback is much weaker.

### Exactly five daily activities and a beginner ladder

Fresh plans contain:

1. Focused tactical decisions.
2. One rotating selected-need exercise: safety, calculation, a focused puzzle, another repertoire stage, own-game review or an ending.
3. The next gated opening stage.
4. A bot-ladder game.
5. An own-game mistake or suitable ending.

The plan explains its selections using available game evidence, goal gap, chosen repertoire, practice budget and weaknesses; it does not invent missing analysis. An already-started legacy session is preserved until it ends or the user deliberately rebuilds it. All fresh sessions use five activities. A time budget is a guide, not a promise that a whole game finishes in that time; steps can be paused.

The daily ladder starts with Sprout. Two unassisted wins advance one tier, draws hold progress, and a loss holds the tier and completes that day's activity immediately. There is no forced-win gate. All bots remain freely selectable outside the ladder. Eligible normal-start bot games adjust **in-app Elo only**. Hints, takebacks, nonstandard training starts and too-short non-mate games remain unrated. Today games cannot erase a different paused ordinary game.

### Calculation lab replaces the piece-location quiz

No supplied solution line or “what piece is on square X?” quiz is shown. Choose side and 1/2/4/6 plies, build a legal scratch line for both sides, then Submit. Opponent moves in that scratch line are **your predictions**, not engine replies. No live evaluation, arrows or chat hints appear before submission.

After submission, MultiPV and before/after searches compare the candidate and modeled replies from each mover's perspective. Multiple sound candidates can pass: acceptance uses win-chance-loss tolerance (6/4/2.5 percentage points by baseline) plus a centipawn-loss guard except in decisively winning positions. Forced-mate lessons require a verified mate continuation. A good first candidate with an implausibly weak modeled defence is explained separately. Insufficient depth, fallback or failed analysis is **ungraded**. The check assesses a submitted line, not every possible forced branch. Post-attempt feedback supplies references/refutations, retry and next. Submitted independent results feed weekly evidence and relevant daily weakness work.

### Broader practical teaching

Tactics/daily lessons have purpose and guided/unaided choices. Unaided tactics remove hint/solution buttons and end the attempt before showing the reference/refutation. Missed/hinted tactical positions enter a capped spaced-revisit queue. Endgame/conversion assessments hide tips/hints while guided versions retain them. Blunder Check retains its distinct safe/blunder purpose and concrete post-answer reply. Coordinates gain untimed practice with corrective square feedback and perspective changes; the old timed find/name assessment remains. Thinking-routine lessons lead into deliberate slow tactics. Rush and Streak remain optional legacy challenges, never compulsory daily teaching.

This does not replace every exercise with the same format or add infinite content. Existing authored endgames, theme puzzles, Rush/Streak and timed-coordinate controllers remain. Evaluation-based conversion and 15-move defensive checkpoints are practical heuristics, not tablebase proofs.

### More honest, consistent game review

Results and review share the same win-chance-based, volatility-weighted/harmonic accuracy calculation. Cache quality uses **achieved** PV depth, engine identity, fallback status and exact PGN signature, never merely requested depth. Old/unknown/shallow caches are not silently treated as deep analysis. Checkmate signs and repetition draws are handled consistently. Quality/depth limitations are visible; optional deeper search increases the budget without promising achieved depth. Missing evaluations fail clearly instead of fabricating scores. Review XP/stat-sample awards are one-shot per game. Accuracy figures are local estimates, not official platform statistics. v6 removed the per-game “Game rating (est.)” (see below).

### Optional multi-premove queue (R3.2)

Settings → Coaching → **Premoves** remains OFF by default and applies only to human-vs-bot games, never lessons or unaided calculation. Queue successive own moves by tap/drag, including the same piece from its future square. **Translucent purple-bordered ghosts show the final queued own-piece positions; dim originals and solid opponent pieces preserve the actual board underneath.** Selecting/dragging a future ghost appends another move; no fake opponent turns or captures are inserted into real chess.js history. The main board never adopts a hypothetical FEN.

The **Premoves · N** toolbar button opens a separate clearly labeled hypothetical planning board, ordered move list, **Remove last**, **Clear all**, and a visible **Back to game** exit. Its opponent pieces are frozen snapshots, not predicted replies; if a future own piece overlaps an enemy, a small marked enemy icon explicitly retains that enemy. The list renders the last40 entries for performance and labels their actual sequence numbers. Execution always starts at #1. Main-board **Clear queue** or right-click also clears everything. A browser resource safeguard permits **10,000 queued moves**—not an unlimited-memory claim or a small UI cap. Projection appends are incremental.

After each actual opponent reply, at most **one** head move is checked against the real current chess.js legal moves. If legal, it is consumed before normal execution, and the remaining queue rebases on the new real position. A different opponent reply does not cancel a still-legal head. If the head becomes illegal, blocked or its source is captured, **all remaining dependent moves are discarded**; ghosts disappear and real own-turn input is restored. No later entry is skipped or reordered. Queued promotions default explicitly to queen; normal promotions retain the chooser.

Every executed premove costs at least0.1 seconds on the human clock before the usual increment; a flag ends the game without playing the head or awarding a second result. Pause, takeback/retry, settings OFF, navigation, game end or cancellation clear the queue and pending bot-delay work. Queues are not saved/restored across pause/reload. The planner closes automatically when manual own-turn input resumes, so an invisible/obsolete planning modal cannot cover the board. Overlay contents and ghost layers do not resize the actual board.

Input hardening: Your turn / Reviewing move / Opponent thinking / Paused / Retry opponent status distinguishes a real lock from the opponent’s turn. Rejected or invalid engine replies offer explicit retry; rejected coach analysis no longer strands progress. Retry restores the correct own decision rather than leaving the wrong side to move. Confirmed static/controller defects also fixed: an unchanged real-piece element is snapped back after speculative dragging, and pointercancel/lostpointercapture no longer commit a cancelled drag. These are tested with simulated Board pointer events, not an assertion that the user’s specific iPhone symptom was reproduced or fully visually verified.

### Weekly plan and report cards

Home → Weekly report cards shows an in-progress preview and completed reports. Weeks run Monday 00:00 through Sunday 23:59 **Africa/Nairobi (EAT)**. Dated first-observed baseline/evidence and ending snapshots persist. Rollover finalizes once when the app is next opened/used; there is no background notification or external message.

Score is the equal-weight mean of available category averages: first-try tactics, submitted calculation, clean opening attempts, unaided safety and eligible no-coach/unassisted game results. Correct/clean/win =100, wrong=0, draw=50. Failed opening runs count even when restarted. Effort/completed daily activities is separate and never added to mastery/Elo. No evidence means no score. Strength/weakness labels require at least 3 attempts in a category. Improvement compares only matching theme/rating bands, opening/depth or bot groups with at least 3 attempts in **each** week; otherwise it says not enough comparable evidence. Recall-depth changes are measured practice evidence, not invented Elo gains. Missed days receive no fabricated data.

## v6 layout, navigation, timed games and review accuracy

**Screens are restructured, not recoloured.** Each content screen is a compact white header (eyebrow, heading, one line, one small selector) above one large black rounded panel with sparse rows (`ui.js`: `App.ui.head`, `panel`, `row`, `listPanel`, `switcher`, `weekStrip`).
- **Home:** date + greeting + this week's practice strip, then one **Today** panel. Its timeline is the real five-step plan; done steps are ticked, and the current step is the only white card, holding the single Continue/Start button. Weekly report, roadmap, Ask Stacy and the engine status are quiet link rows in the panel foot.
- **Today:** the same header + timeline before starting and after finishing. During a session there is one compact heading (step, Why, Pause, step dots) above the exercise.
- **Learn:** an *Openings | Skills* selector. Openings lists the courses as one path; the course to continue is the white card. Skills is a sectioned list.
- **Course:** header with a line selector (locked branches disabled), then a **Your path** panel with the five ordered stages. The current stage is the white card containing Continue.
- **Play:** *Choose your opponent* header with the colour selector, then one **Game setup** panel listing the bots. The selected bot expands into the white card (bio, strength, coaching, time control, Let's play). Pace and start position are in *Game options*.

**No bottom tab bar.** Navigation is a labelled **Menu** pill in the top-right corner. It opens a rounded panel listing Today, Learn, Skills, Play, Me, Weekly report and Settings. The current location is marked (`aria-current`), and a dot and count show reviews that are due. It closes with Close, Escape, an outside tap (swallowed so it can never become a chess move) or Back. Focus moves into the panel and returns to Menu. Opening it never routes or pauses anything; only choosing a destination navigates. That uses the existing leave/pause/save path, so a live game is never lost. It respects safe areas, and no space is reserved at the bottom.

**Board-first game and lesson screens:**
- The opponent row, a full-width square board and your row come first.
- Below them, a black dock holds the coach, at most three primary actions and **More**.
- **More** opens a bottom drawer with the secondary tools: flip, resign, draw, PGN, chat, premoves, move list, status and checklist panels. It closes with Done, Escape or an outside tap, and opening it never changes the game.
- On screens ≥900px wide, the drawer is a permanent side column.
- The middlegame-plan coach prompt now carries the compact 5-step checklist. The full checklist is under More.

**Bullet and Blitz.** The bot setup card has a visible *Time control* picker: Untimed, **Bullet 1+0 / 2+1**, **Blitz 3+0 / 3+2 / 5+0** (and the existing 5+3), and Rapid 10+0. The choice is remembered.
- One clock model (`App.GameClock`) deducts real elapsed time from a monotonic clock (`performance.now`), not by counting timer ticks. Increment is added exactly once per completed legal move.
- Premoves still cost 0.1 s. Pause and leaving stop both clocks, and saved games resume with the saved times.
- Both clocks are visible, and the running one is highlighted. Under 10 s it shows tenths.
- A flag loses, except when the opponent has only a lone king, or only K + one minor piece against a bare king; then it is a draw. No other draw claims are made.
- Rematch keeps the preset. Bullet uses the bot's fast thinking pace.
- These are timed games against local bots only; there is no online play.

**Results and review, more accurate (not relabelled).** One canonical pass (`App.Analysis.run`) now feeds Results, Review, the graph and the counts; Review no longer re-judges moves.
- Evaluations are White-POV. Mover losses and win% before/after are derived consistently. Checkmate is 100/0, stalemate and repetition are 50.
- Engine results are accepted only for the same position, at an adequate achieved depth, and from the same engine identity. A failed or wrong-position evaluation leaves that move **ungraded**, never a fake 50%. It is excluded from accuracy, and coverage ("x/y moves analysed") is shown. Accuracy is withheld below 80% coverage.
- Shallow/fallback grades are marked limited-depth and cannot claim Brilliant, Great or Miss.
- Per-move accuracy uses a Lichess-style win% curve. The harmonic mean has a floor of 1, so one bad move cannot halve the game score by itself. This is not Chess.com's formula.
- The **turning point** is the eventual loser's move that took a playable position (≥40%) to a lost one (<40%) with no later recovery to 50%. It falls back to the largest real error, or nothing in a clean game. Move numbers respect custom start positions, and the link opens that exact move in Review.
- The graph labels its sides and your colour, marks key moves, and maps taps to the same move index as Review.
- **No per-game rating.** One game cannot measure a rating. Results show average centipawn loss, mistake/blunder counts and coverage instead, and the bot's approximate level is shown as a separate label. Metrics are not clamped to the bot's advertised level, so an ~800 bot can outplay its label in a given game.
- *Run a deeper review* uses a larger search budget. Progress is saved every few positions, and **Stop · resume later** or leaving the screen resumes instead of restarting.
- The unrated note now names exactly what happened, e.g. "you used 1 hint". A hint counts only if one was actually shown (once per position). Takebacks and Retry move count as takebacks.

**v6 limits:**
- The Me, Settings, onboarding and some trainer screens keep their v5 card styling.
- While coaching is on, the post-move review time runs on the bot's clock.
- Accuracy remains an engine estimate whose quality depends on the achieved depth shown.
- No phone or browser visual QA was performed, and no screenshots exist.

## Design system (v5)

The look is minimalist and monochrome, designed for phones first. The page is light grey with a white canvas (on wider screens the canvas is a rounded white sheet). Key content sits in large black panels with rounded corners. The first panel under the header has a tighter top-left corner, so it reads as flowing out of the white header.

**Shared components:**
- **Text:** plain system type with bold black headings. No external fonts or assets.
- **Buttons:** pill shapes in 5 states:
  - primary: filled black (white on black panels)
  - secondary: outlined
  - danger: red
  - disabled: flat grey
  - loading: spinner
- **Navigation:** a charcoal segmented control with a white selected pill, and a white footer nav with a black sliding pill.
- **Cards and coach:** quiet grey cards, small restrained icons and fewer decorative badges. The coach panels on board screens are black.
- **Course page:** a black timeline panel. The current stage is a white inset card.

**Sizes:**
- Buttons, nav items, inputs and list rows are at least 44 px tall. Small buttons are 40 px.
- Board-screen toolbars have 44 px pills in a 46/48 px slot.
- Buttons inside the bounded coach slot are 36 px, so the board keeps its size.

**Board:** phone boards keep the v3 geometry contract (`App.boardGeometry` plus the `--*-slot` CSS variables). A 390×780 phone still gets a full-width square board. Squares stay neutral but clearly two-tone. Last-move, check and hint colours are kept. Arrows get a thin dark halo for contrast on pale squares.

**Themes:** the saved theme keys are unchanged. `ice`, `crimson` and `midnight` are now shown as **Paper**, **Graphite** and **Ink** (dark). All styles live in one sectioned `style.css`; the old stacked override layers (glass, wallpapers, glow) were removed.

## Files

Keep all **27 files** together (22 JS + HTML + CSS + JSON + 2 Markdown):

- `index.html`, `style.css`, `manifest.json`: shell, appearance and launch metadata.
- `pieces.js`, `board.js`: embedded art and interactive board.
- `engine.js`, `coach.js`, `ai.js`: engine, chess facts/grades, optional Gemini text/speech.
- `openings.js`, `puzzles.js`: authored repertoire and embedded datasets.
- `app.js`, `trainers.js`, `play.js`, `analysis.js`, `explain.js`: core and existing controllers. `play.js` holds the time-control presets and clock model. `analysis.js` holds the canonical review pass.
- `ui.js` (v6): shared header/panel/timeline components, the top-right Menu panel and board-action classification. It loads right after `app.js`.
- `bots.js`: personas, original avatars and built-in text chat.
- `premove.js`: incremental own-piece projection, 10,000-move resource guard, and real-position validation.
- `middlegame.js`: authored per-line middlegame plans, candidate legality filter and the 5-step checklist.
- `curriculum.js`: phased/chunked opening controllers and safety assessment. Includes the stage-4 bridge and stage-5 Help-me-plan switch.
- `upgrade.js`: consent/reset, preference builder and personal-goal settings.
- `progression.js`: ordered public-profile onboarding and five-activity ladder plan.
- `weekly.js`: dated evidence, score and report cards.
- `calculation.js`: scratch-line calculation and after-submit grading.
- `lessons.js`: specialised teaching entrypoints, untimed coordinates and course path UI.
- `README.md`, `THIRD_PARTY.md`: instructions and preserved notices.

Script order in `index.html` is intentional. Later R3 modules replace primary old opening/course/calculation screen handlers while retaining legacy helpers for compatible saved state and specialised modes. No package.json or build output is missing.

## Dependencies, privacy and limits

v9: chess.js 0.10.3 and Stockfish 19 Lite are bundled (see the v9 section); the older CDN loading described in earlier notes is gone. All three piece sets (Classic/Cburnett, Stacy Geo, Stacy Block) and all bot avatars are embedded; nothing piece-related is fetched. Public game/profile APIs are read-only. Optional Gemini retains the existing direct-browser key/usage/voice setup; keys and progress are unencrypted browser localStorage. Turning text AI off does not by itself turn separately enabled coach speech off. Bot chat is always local text.

No API key is required for ordinary coaching, bots or lessons. No actual user's public-account or Gemini requests were used during implementation tests. Current service availability/model names, real iPhone touch/audio/worker behavior and pixel geometry still require browser/device acceptance testing. Very short landscape screens use a different game layout: the board sits on the left and the dock on the right. Export before clearing browser data. No rating gain, certification or timeline is promised.

## Verification performed for this build

Isolated Node tests use chess.js0.10.3, DOM/controller stubs and mocked public responses, not browser automation. The suite covers legal repertoire lines, Black turns, phase gates/chunk growth/resume, one-shot puzzles, migration/reset, arbitrary goals, named bot selection/identity, active-game isolation, accuracy/cache/terminal/repetition consistency, worker recovery, latest30 filtering and real rating labels, five-step ladder behavior, bot-chat no-speech, weekly rollover/no-evidence comparisons, premove legality/cancellation/exactly-once, calculation alternatives/mate/failure, and content-independent geometry math. Full JavaScript/inline-boot syntax, JSON, local HTML references and ZIP byte/hash consistency are checked separately. v5 adds static design checks that parse the shipped CSS and markup:
- self-contained assets and balanced rules
- every referenced class still styled
- touch-target sizes and the button-state hierarchy
- WCAG contrast for text and controls in all three themes
- square and piece contrast
- 390×780 board geometry
- safe areas and dynamic viewport units
- theme keys

v6 adds structural, navigation and accessibility tests:
- Home, Today, course, Learn and Play structure, including exactly one current white card and where the primary action lives
- the menu dialog: ARIA attributes, the current location, every route registered, and close by button/Escape/outside tap/Back with focus return; opening it never touches a live timed game
- board-stage DOM order, the three-action limit and the drawer
- time-control presets, monotonic clock deductions, exactly-once increment, Pause, flag rules, the end-to-end timed game and rematch
- review reliability: eval perspective, mates, failed or wrong-position evaluations, shallow fallback, thresholds, graph indices, turning point and links, cache/depth validity, resumable deep review, exact assisted notes, and no per-game rating

These checks are not a claim of completed visual iPhone QA. No screenshots were produced; real Safari/iPhone rendering, `:has()` support and visual polish still need checking on a device.

Preserve `THIRD_PARTY.md`. Original upload files and the original recovery ZIP were not modified.

## v7 · motion, menu fix, Light/Dark palette, distinct hubs

**Menu (fixes "I can still press it").** v6 closed the menu on `pointerdown`, so the rest of the tap
(the `click`) landed on whatever was underneath — often the Menu button itself, which re-opened it.
v7 uses an explicit state machine (closed → opening → open → closing). The backdrop sits above the
top bar, swallows press events, closes on `click`, and keeps blocking until the exit animation has
finished. `#app` is `inert` while the menu is open. Re-opening during the exit reverses it; Escape,
Close, outside tap and the phone/browser Back gesture all close it; a safety timer settles the state
even if animation events never arrive. The backdrop no longer uses `touch-action:none`, so a long
menu can scroll.

**Navigation motion (`motion.js`, new).** One owner for every route change:
- Menu destination → a rounded shape grows from the row you chose, sweeps across the screen with
  the destination name, then lifts away to reveal the page (≤ 480 ms total; circle clip-path, fade
  fallback where clip-path is unsupported).
- Drill-down → page slides in from the right over a dimmed, inert snapshot of the previous page.
- Back (button, gesture, browser) → exact reverse, and your scroll position is restored.
- Learn ↔ Skills → the segmented pill glides to the new tab; content slides in that direction.
- A screen re-rendering itself (Today steps, settings) is not animated at all.
Only transform/opacity/clip-path animate. The next page renders immediately (no artificial waits).
Taps are blocked only while content is covered/moving and never on board screens, so clocks and
move input are never delayed. Rapid navigation finishes the previous transition first. Reduced
motion (OS setting or Stacy's animation setting) = no movement at all.

**Palette.** Light (saved key `ice`) and Dark (`midnight`) from the owner's neutral greyscale scale;
the old warm Graphite theme migrates to Light without touching progress. Board squares, last-move,
check, hint, premove and error colours keep their own functional contrast. Text pairings are
computed in tests (`contrast-v7.txt`).

**Hubs with their own structure.** Learn stays a path timeline. Skills is a skill board (live Tactics
tile with rating, Rush/Streak bests and quick modes; 2×2 thinking-trainer grid with your real
accuracy; endgame progress tile; coordinates). Tactics opens on a picker with your rating, Mixed
training, a "Needs work" strip computed from your own theme results, and a theme grid with accuracy
bars. Play has an opponents shelf (every bot with approximate strength) and a tools grid with live
counts. Press feedback (quick scale) is shared across rows, tiles and menu items.

Limits: verified with a VM test suite and jsdom DOM tests (menu state, cleanup, rapid routes,
reduced motion, focus/inert, scroll restore). Visual smoothness on a real iPhone has not been checked.

## v8 · Customize (layouts, theme, board colours, pieces) and tab motion

**Where:** Menu → *Customize* (under More), or Settings → Look & feel → *Customize*. The theme picker and pieces dropdown moved there; coordinates, legal-move dots and sound stay in Settings.

**How it works:** Customize edits a draft. Nothing changes until **Apply**. The preview at the top is labelled *Preview · your real plan, no new scores*. It renders the chosen layout, with your current plan as read-only content, plus a sample board position, all in the chosen theme, board colours and pieces. Everything sits inside an inert frame that cannot be tapped and records nothing. **Cancel**, the header Back button or the phone Back gesture discard the draft. Apply saves the four choices (`settings.layout`, `theme`, `boardColors`, `pieceSet`) and re-renders. XP, ratings, plans, games and mistakes are untouched.

- **Layouts** (different templates for Home and Learn, built from your real progress):
  - *Path*: the v7 timeline, unchanged.
  - *Focus*: a dashboard with a summary card (current step, its reason, done/total dots, main button), quick-jump pills and a grid of plan step tiles with status.
  - *Gallery*: a side-scrolling shelf of opening courses with board thumbnails, plus category tabs (Openings / Skills / Play).
  - The main button in every layout uses your actual plan (*Start today* / *Continue step n*).
  - The upper Menu stays; there is no bottom navigation.
- **Theme:** Light / Dark use the exact v7 greyscale palettes.
- **Board colours:** Neutral (the theme's grey board), Slate, Stone, Wood, Green, High contrast. Only `--sq-light/--sq-dark` change. Arrows, last move, check, legal dots and premove ghosts keep their own colours. Contrast was computed for every set (`board-colours-v8.txt`). The lowest values are 2.0:1 between square colours (neutral light), 2.4:1 for a white piece fill on a dark square, 3.8:1 for a black piece on a dark square, and 12:1 or more for piece outlines on light squares.
- **Pieces:** Classic (Cburnett), Stacy Geo (curved geometric) and Stacy Block (stepped rectangles). Geo and Block are original inline SVGs. The chosen set applies to the game board, promotion picker, premove ghosts, review, analysis, calculation and thumbnails. Old saved Lichess set names fall back to Classic. Drag and pointer code is unchanged: in `board.js` only the piece-image lookup changed, and a test enforces this.
- **Tab motion:** segmented tabs have their own motion, separate from page transitions. The selection pill stretches across to the new tab (360 ms) and the tab content slides 16 px in the tab's direction (220 ms). This covers App.seg, App.tabs, the Learn/Skills switcher, the Gallery categories, the time-control categories and the Game Review import tabs. A new tap cancels the running stretch. Nothing animates with reduced motion. Board moves and coach updates never animate.
- **Play hub:** Analysis board, Game Review and My mistakes are now full-width rows with an aligned icon, a one-line title, a short description and your real saved counts. Titles don't wrap.

**Verified for v8:** 115 sandbox regression groups (`test-v8.js`) and 16 jsdom groups (`test-v8-dom.js`: the 9 v7 motion/DOM groups plus 7 new v8 groups). The new groups cover draft/cancel/back/apply persistence, progress preserved, distinct layout DOM and Learn templates, Gallery tab content, pill and swap animation and cancellation, reduced motion, distinct piece SVGs with no glyphs or network, set propagation, board-colour contrast, and Play rows with counts. All JS files pass `node --check`.

**Not verified:** No real phone or browser screenshots were taken. The box has no SVG rasteriser and browser automation was not used. So how the new piece drawings, Focus/Gallery layouts and the stretch pill look on an iPhone has **not** been checked by eye; please look on a device. jsdom has no layout, so pill positions were tested with stubbed widths.

**Not in v8 (queued):** stronger engine and every-move review, the post-game results flow, Multiplayer (Firestore + Cloud Functions, needs the Blaze plan) with username/password auth and profiles. No Multiplayer code and no Firebase changes are in this build.


## v9 · real engine, every move graded and explained, post-game flow

### Engine: what is bundled and how strong it is
- **Stockfish 19 Lite, single-threaded WebAssembly** (stockfish.js 19.0.1 release, UCI id `Stockfish 19 Lite WASM`), in `engine/`. Unmodified official release files; GPL-3.0 licence, authors, the corresponding source archive and the NNUE net are shipped alongside (`engine/SOURCE.md`, `THIRD_PARTY.md`).
- Single-threaded so it needs no COOP/COEP headers; works over plain HTTP (Koder preview, any static host) and offline once loaded. `engine/stacy-engine-loader.js` lets it load when the server sends a generic MIME type for `.wasm`.
- Why Lite: the full Stockfish 19 build carries a ~99 MB network, too heavy for a phone download; multi-thread builds need cross-origin isolation. Lite uses a small net, so it is weaker than full desktop Stockfish, but at the depths below it is still far beyond human strength. No strength number is claimed.
- **Size impact:** about 1.9 MB of engine files the browser downloads (`.js` + `.wasm`), plus 1.6 MB of source/net kept only for the GPL (not loaded at runtime), plus 48 KB chess.js. The v9 ZIP is about 2.95 MB in total.
- If WebAssembly or the worker is unavailable, the app uses **Stacy Lite** (the built-in simple search), says so in Settings → Chess engine, and Game Review marks every move **Not graded** instead of inventing grades.

### One shared analysis service
- `engine.js` is a single queue used by game review, live coaching, opening/trainer verification, hints and bots: priorities play > interactive > background, a running background search is pre-empted (stopped and re-queued) by a bot move, every owner can cancel its jobs, a watchdog restarts a stuck worker (twice, then Lite).
- Shared cache keyed by position (first 4 FEN fields, plus the 50-move counter late in it). A cached result is served only for the same engine, at the requested depth or deeper, with enough lines. Reduced-strength bot searches are never cached or served.
- Illegal positions (the side not to move in check) are refused before they reach the engine, which would otherwise abort.
- **Budgets:** live coaching depth 14 / 1.5 s (grades need depth ≥ 10); Game Review depth 14 / 3 s, MultiPV 2 (grades need ≥ 12); "Deeper review" depth 18 / 8 s (≥ 16); sacrifice verification depth 18 / 5 s (≥ 15). A forced mate in N counts as proven at depth ≥ 2N−1.
- Bot personalities keep their own Skill Level / depth settings. The engine under them changed (SF 17.1 lite → SF 19 lite), so bot levels remain approximate labels.
- Engine help (hints, best-move arrows) is refused while an unaided test or exam is running.

### Every move gets a grade and an explanation
`review.js` classifies each move from the engine data for that exact position (mover's point of view, win chance from the engine score):
- **Best**: the engine's first choice, or an alternative within 1 win-chance point in the same search; the only legal move; mate in one.
- **Excellent / Good / Inaccuracy / Mistake / Blunder**: win-chance loss below 2 / 5 / 10 / 20 / 20 or more.
- **Book**: an opening repertoire move that loses less than 5.
- **Miss**: the opponent had just erred (≥ 10), you were winning (≥ 70%), and you let most of it go (loss ≥ 10) but are still ≥ 35%.
- **Great**: the engine's strict first choice when the second-best line (searched to depth 12 or more) is at least 20 points worse, the move keeps you at ≥ 30%, and the after-move search agrees. Not given for recaptures, forced moves or mate in one.
- **Brilliant**: a best-level move that really offers material (static exchange check: net offer of at least 2 pawns, not regained at once), keeps ≥ 50%, is not played from an already-won (≥ 97%) position unless it forces mate, and is **confirmed by a deeper search of the position after it and of the position after the sacrifice is accepted**. Unconfirmed candidates stay Best.
- **Not graded**: the fallback engine, or a search shallower than the required depth. A rough estimate may be shown, labelled as one.
- Checkmate, stalemate and other draws after a move are decided by the rules, not by the engine (so stalemating a won position is a Blunder, with the reason given). Repetition is not visible to a single-position search; threefold repetition is handled by the game rules only.
- The text is built only from that data: Brilliant/Great/Best never say another move was stronger, error grades name the engine's better move and its line. Authored strategy notes are never presented as engine output.

### Post-game flow
1. The result is saved first ("Game saved · …").
2. Analysis runs with real progress ("Position k of n · depth d · engine", then "Verifying N possible sacrifices"), with **Stop**.
3. Stop offers **Resume**, **Show limited summary** (clearly labelled partial, accuracy only if ≥ 80% of your moves are graded) or **Leave · resume later**. Progress is kept; no fake 100%.
4. When complete, a summary popup opens once per game: result, accuracy (only with adequate coverage), grade counts, key findings, the engine/depth line, and **Open Game Review**.
5. Game Review shows the same stored grades (no second grading), awards review XP once, and saves only graded mistakes for practice.

### Tests actually run (Node 24 on the build box; test files are not in the ZIP)
- `v9/test-v9-engine.js`, **13 groups with the real bundled engine** (Node WebAssembly, one thread): asset hashes and licence files; boot and UCI id; score perspective and mate signs; curated positions (Légal's Nxe5 → Brilliant verified; unsound Bxf7+ → Blunder; hanging Qxf7+ → Blunder; Qh5 → Inaccuracy; routine moves/recaptures → Best; Qxf7# → Best); 24 tactics puzzles (solution = engine's top move 24/24, graded Great 21 / Brilliant 3, explanation never contradicts the grade); Morphy's Opera game end to end (33 positions, depth 14, ~8.4 s; Qb8+ Brilliant, Rd8# Best; reopening uses saved data with no new searches); stop → partial → resume; cache identity; cancellation and pre-emption; stalemate/terminal handling; help gate; fallback without WebAssembly.
- Timing on that machine: depth 10 ≈ 30 ms, depth 14 ≈ 0.3 s, depth 18 ≈ 1.1 s for a middlegame position. A phone will be slower.
- `v9/test-v9-classifier.js`, 12 groups: every grade threshold on both sides, equal alternatives, book, Black's perspective and mate scores, the depth gate, only-move and mate-in-one, Miss conditions, Great's conditions, Brilliant unverified / failed / verified, stalemate, explanation wording.
- `test-v9-postgame-dom.js`, 7 jsdom groups (stand-in engine for the screen flow): saved-first, progress text, popup once, Open Game Review shows identical grades with no new searches and XP once, Stop choices/limited summary/resume, leave closes the popup, shallow-engine Not graded, Settings engine card, help gate.
- `v9/test-v9-loader.js`: the MIME fallback logic of the loader.
- Regressions: `test-v9.js` 115 groups and `test-v9-dom.js` 16 groups (v6–v8 behaviour on the v9 code).
- **Not tested:** any real browser, Safari/iPhone, the Koder preview, real worker start-up and download time on a phone, or visual layout. These need a device check.

### Still queued (v9)
Multiplayer moved to v10, below.

## v10 · Multiplayer (code only, backend not deployed)

**Status:** the app shows **"Multiplayer not set up yet"** until the backend is deployed and `firebase-config.js` is completed. Nothing else changes: local progress, bots, training and review work as before and are never reset. No account is needed except for Multiplayer.

### What it does
- **Accounts without email:** username + password. Usernames are unique ignoring case (taken names get suggestions). Passwords are hashed with scrypt on the server (Cloud Functions); the app signs in with a Firebase custom token the server issues only after the password (or a recovery code) checks out.
- **Recovery codes:** 8 one-time codes generated on the server, shown once in the app ("I saved these codes" must be ticked), stored only as hashes. A code resets the password and signs out other devices. New codes can be made with the password.
- **Delete account:** needs the username and password; ends open games, deletes the profile and history, frees the name (a new owner gets a new account id and none of the old history); opponents see "Deleted player".
- **Private rooms by code:** create (time control 1–30 min + increment, colour choice) → 6-character code → friend joins → **both accept the fair-play rules** → 10 s countdown → game. Rematch needs both players and swaps colours.
- **The server decides everything:** legal moves (chess.js on the server), turn, clocks, flag, resign, draw offers and the result, each inside a Firestore transaction with a move number (anti-replay) and version checks. The app only displays the server's state. Players cannot write to the database at all.
- **Fair play:** app hidden for more than 30 s → loss; no contact for about 35 s (closed app, lost connection) → loss; staying visible but idle only costs clock time. During a live game the engine, coach, hints, takebacks, Game Review and other screens are off (leaving asks "Resign and leave?").
- **Profiles:** username + preset piece avatar, public (searchable) or private, and a history of finished, server-verified games only.
- **After the game:** the verified result is saved locally once and opens the normal v9 Results → Game Review (analysis after the game only).
- Book grade colour is now grey `#767676` (was beige) to fit the greyscale palette.

### New files
- `firebase-config.js`: the only file to edit when going live (one ▼▼▼ placeholder for the Web API key).
- `multiplayer.js`: accounts, rooms, live game screen, profiles, the fair-play lock. Loads after `customize.js`.
- `vendor/firebase/`: Firebase JS SDK 13.2.0 compat files with licence and `NOTICE.md`.

### Going live (owner steps)
See `README.md` in `stacy-multiplayer-backend.zip`. When the backend is deployed, edit **only** `firebase-config.js`: paste the Web API key where the ▼▼▼ placeholder is and set `backendDeployed: true`. The Web API key identifies the project; it is not a password. No credentials or service-account keys are in the app.

### Honest anti-cheat limits
- Visibility and presence are **reported by the app itself**. A modified client can claim to be visible, and nothing can detect a second device, another person or an engine on another screen. The rules make cheating harder and abandoning costly; they are not tamper-proof.
- Rate limits use a hashed client IP (pseudonymous, not anonymous); players behind one network share limits, and an attacker with many IPs gets more attempts. Repeated wrong passwords lock an account for up to an hour; recovery codes have a separate limit so the owner can still get in.
- App Check is not used: the backend has a switch for it, but this app does not include the App Check SDK, so turning enforcement on would block the app (see the backend README).

### Tests actually run (build box, Node 24; test files are not in the ZIP)
- Backend (in the backend ZIP, Firebase emulators for Auth, Firestore and Functions, project `demo-stacy`): 13 game-logic unit groups, 6 security-rules groups, 21 two-client flow groups (accounts, case-insensitive uniqueness race, lockout, recovery, full game to mate, replay/concurrency races, hidden and no-heartbeat forfeits, flag timing, draw versions, rematch, code brute-force limit, profile privacy, deletion and name reuse, rate limits, sweep).
- `v10/test-v10-sdk-emulator.js`, 3 groups: this app's own `multiplayer.js` with the bundled SDK (in jsdom) against the emulators: sign-up, custom-token sign-in, two clients create/join/accept/play over live Firestore updates, resign, verified result saved locally, search and privacy under the real rules.
- `v10/test-v10-mp-ui.js`, 11 jsdom groups with an in-memory server running the real game module: not-set-up state, SDK lazy loading from `vendor/`, sign-up/suggestions/recovery-code sheet, two-device game with premove and illegal-move refusal, engine gate, navigation guard, hidden heartbeat, draw offer, save once → Results → Game Review list, rematch, Resign and leave, profiles, Book colour.
- Regressions on the v10 code: `test-v9.js` 115, `test-v9-dom.js` 16 (one count updated for the new Multiplayer row), `test-v9-postgame-dom.js` 7, real engine 13, classifier 12, loader 1.
- **Not tested:** a real Firebase project or deployment, real network latency, any real browser, Safari/iPhone, or the Koder preview.

## v11 · "Learning from your latest games" no longer stalls; the page stays responsive

**What went wrong (v10 and earlier).** When the bundled Stockfish could not run or stopped answering, the app fell back to "Stacy Lite", a tiny engine that runs on the page itself. Its search followed every capture at the end of a line with no limit. In opening positions that is quick, but in an ordinary middlegame one position could take 30+ seconds on a desktop (measured: about 33 s on the build box) and much longer on an iPhone. While it ran, the page could not draw or respond, so progress froze ("6 positions checked", 0%), everything felt very slow, and iOS could kill the tab, which then came back blank. The baseline also had no limit per position: a position that never got a result was retried forever.

**What v11 changes**
- Stacy Lite is strictly bounded (about 60 ms per call, node budget plus a hard time cap, proper quiescence search). Measured worst case on the build box: under 80 ms per position.
- Every baseline position has a 15 s watchdog. A position with no result, a timeout, an illegal position from an odd PGN, or a page reload during that position is skipped (shown as "N positions skipped") and the batch continues. Route changes are retried, not skipped.
- The engine's own watchdog is tighter for short searches (2 × movetime + 4 s; about 4 s for the baseline) and restarts a hung worker. Only one worker runs at a time. After repeated failures it uses the bounded fallback, labelled honestly on the screen with a **Try the full engine again** button. A long run of good searches resets the restart allowance.
- The baseline runs at background priority, so coach/bot engine work goes first. Each game's PGN is parsed once per session instead of up to four times, and importing games yields to the page between games.
- Progress shows game N of 30, position P of K, a percentage that rises with every position, the engine in use and why it is waiting (app in the background, a board on screen, a live Multiplayer game). It is saved after each position and resumes where it stopped.
- Start-up guard: if start-up fails or takes over 12 s, a recovery card appears (Reload / Start without analysis) instead of a blank page. Returning from Safari's page cache re-draws the screen if needed.
- Saved progress, Multiplayer and all v10 features are unchanged.

**Tests (build box, Node 24, jsdom; test files are not in the ZIP)**: `v11/test-v11-baseline.js`, 13 groups. They include the real Stockfish running a 30-game batch from a saved fixture of 45 public Chess.com games (about 25 s, 360 positions, nothing skipped, longest main-thread pause under 100 ms in Node, one worker). They also cover: a worker that hangs after 12 searches every time; one that hangs once; one that never starts; retrying the full engine; an analysis that never answers; odd PGNs, an illegal start position and a missing game; waiting while a board is shown; app hidden then visible and pageshow; navigation cancels; a reload during a position; and the start-up recovery card and "Start without analysis". Regressions on v11: test-v9 115 (watchdog timing updated), v9 DOM 16, post-game 7, real engine 13, classifier 12, loader 1, Multiplayer UI 11, app SDK against the emulators 3.

**Not verified:** a real iPhone, Safari or Koder. In Node the engine shares the test's thread, so phone timings will differ. The bundled Stockfish needs WebAssembly SIMD (Safari / iOS 16.4 or newer); on older iOS the app uses the bounded fallback and says so.
