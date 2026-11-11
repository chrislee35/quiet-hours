/** Overlay styles. Font size is one variable so text scaling (ACC-3) is a single setting later. */
export const OVERLAY_CSS = `
:root { --qh-font: 16px; }
:root { --qh-live: #5fd6ee; --qh-live-soft: #a6ecff; --qh-good: #7fe08a; --qh-good-soft: #c8f5d2; --qh-bad: #ff7a8a; --qh-bad-soft: #ffb0bd; --qh-warn: #ffd36b; --qh-warn-soft: #ffe9a8; --qh-text: #dfe2f3; --qh-muted: #9aa0c4; }
.qh-panel { position: fixed; background: #10121cf2; color: var(--qh-text); font: var(--qh-font)/1.45 system-ui, sans-serif;
  border: 1px solid #3a3f5c; border-radius: 8px; padding: 14px 16px; box-sizing: border-box; }
.qh-hud { left: 12px; top: 12px; font-size: .8em; line-height: 1.35; padding: 8px 10px; pointer-events: none; max-width: calc(100vw - 24px); }
.qh-hud div:nth-child(1) { font-weight: 600; color: var(--qh-warn); }
.qh-hud div:nth-child(4) { color: var(--qh-bad-soft); min-height: 1.35em; }
.qh-hud div:nth-child(5), .qh-hud div:nth-child(6) { color: #8b91b5; }
.qh-dialogue { left: 50%; transform: translateX(-50%); bottom: 16px; width: min(760px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; }
.qh-dialogue h2 { margin: 0 0 2px; font-size: 1.1em; color: var(--qh-warn); }
.qh-dialogue .mood { font-weight: 400; color: var(--qh-muted); font-size: .85em; margin-left: .4em; }
.qh-dialogue .trust { color: var(--qh-muted); font-size: .85em; margin: 0 0 8px; font-style: italic; }
.qh-dialogue p { margin: .4em 0; }
.qh-dialogue .notice { margin: 8px 0; padding: 6px 10px; border-left: 3px solid var(--qh-warn); background: #1b1f33; color: var(--qh-warn-soft); font-size: .9em; }
.qh-dialogue .speaker { color: #8fd3ff; }
.qh-choices { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.qh-choices button, .qh-picker button { text-align: left; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c;
  border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-choices button:hover, .qh-choices button:focus-visible, .qh-picker button:hover, .qh-picker button:focus-visible { background: #2a3050; outline: 2px solid var(--qh-warn); }
.qh-choices .key { color: var(--qh-warn); margin-right: .6em; }
.qh-picker { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.qh-notebook { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; z-index: 4; }
.qh-notebook h2 { margin: 0 0 8px; font-size: 1.1em; color: var(--qh-warn); }
.qh-notebook ul { list-style: none; margin: 0; padding: 0; }
.qh-notebook li { padding: 7px 0; border-top: 1px solid #2a2f48; }
.qh-notebook .from { color: var(--qh-muted); font-size: .8em; }
.qh-notebook .status { font-size: .8em; margin-left: .4em; }
.qh-notebook .verified { color: var(--qh-good); } .qh-notebook .disproved { color: var(--qh-bad); text-decoration: line-through; }
.qh-notebook .hint { color: var(--qh-muted); font-size: .8em; margin-top: 8px; }
.qh-notebook .tabs { display: flex; gap: 6px; margin: 0 0 10px; }
.qh-notebook button, .qh-notebook select, .qh-notebook input[type=search] { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 10px; }
.qh-notebook button { cursor: pointer; }
.qh-notebook button.on { background: #0f2b35; border-color: var(--qh-live); color: var(--qh-live-soft); }
.qh-notebook button.small { font-size: .8em; padding: 2px 8px; margin: 3px 4px 0 0; }
.qh-notebook button:hover, .qh-notebook button:focus-visible, .qh-notebook input:focus-visible, .qh-notebook select:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-notebook .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.qh-notebook .bar input { flex: 1 1 12em; min-width: 0; }
.qh-notebook .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.qh-notebook .conflict { margin: 6px 0; padding: 6px 10px; border-left: 3px solid var(--qh-bad); background: #2a1620; color: var(--qh-bad-soft); font-size: .9em; }
.qh-notebook .conflict.settled { border-color: var(--qh-good); background: #14281c; color: var(--qh-good-soft); }
.qh-notebook .linking { margin: 6px 0; padding: 6px 10px; border-left: 3px solid var(--qh-warn); background: #2a2410; color: var(--qh-warn-soft); font-size: .9em; }
.qh-notebook .rel { color: var(--qh-muted); font-size: .8em; margin-top: 2px; }
.qh-notebook .rel.contradicts { color: var(--qh-bad-soft); }
.qh-notebook .rel.mine { color: var(--qh-warn-soft); }
.qh-notebook .quests > li.complete .qhead strong, .qh-notebook .quests > li.failed .qhead strong { opacity: .7; }
.qh-notebook .steps { margin: 4px 0 0 .4em; }
.qh-notebook .steps li { border: 0; padding: 1px 0; color: #c8cce6; font-size: .9em; }
.qh-notebook .steps li.done { color: var(--qh-good-soft); }
.qh-notebook .legend li { border-top: 1px solid #2a2f48; }
.qh-map { width: 100%; height: auto; display: block; background: #0a0c18; border: 1px solid #2f3452; border-radius: 6px; margin-bottom: 8px; }
.qh-map .mwall { fill: #2c3150; }
.qh-map .mzone rect { fill: var(--qh-live); opacity: .22; }
.qh-map .mzone.p1 rect, .qh-map .mzone.p2 rect { fill: var(--qh-warn); opacity: .25; }
.qh-map .mzone.p3 rect { fill: var(--qh-bad); opacity: .28; }
.qh-map text { font: 600 10px system-ui, sans-serif; fill: #e9ecff; text-anchor: middle; paint-order: stroke; stroke: #0a0c18; stroke-width: 3px; pointer-events: none; }
.qh-map text.left { text-anchor: start; fill: #b9c2f0; font-weight: 500; }
.qh-map .mpin.place { fill: var(--qh-warn); stroke: #0a0c18; stroke-width: 1.5; }
.qh-map .mpin.person { fill: #8fd3ff; stroke: #0a0c18; stroke-width: 1.5; }
.qh-map .mpin.you { fill: var(--qh-good); stroke: #0a0c18; stroke-width: 1.5; }
.qh-gear { left: 16px; top: 120px; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 140px); overflow: auto; }
.qh-gear h2 { margin: 0 0 8px; font-size: 1.1em; color: var(--qh-warn); }
.qh-gear h3 { margin: 12px 0 4px; font-size: .95em; color: #8fd3ff; }
.qh-gear .meters { font-weight: 600; color: var(--qh-live-soft); margin: 0 0 6px; }
.qh-gear ul { list-style: none; margin: 0; padding: 0; }
.qh-gear li { padding: 6px 0; border-top: 1px solid #2a2f48; }
.qh-gear .head { display: flex; gap: .5em; align-items: baseline; flex-wrap: wrap; }
.qh-gear .head button { margin-left: auto; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.qh-gear .head button:hover, .qh-gear .head button:focus-visible { background: #2a3050; outline: 2px solid var(--qh-warn); }
.qh-gear .cost, .qh-gear .desc, .qh-gear .hint { color: var(--qh-muted); font-size: .8em; }
.qh-gear .note { color: var(--qh-bad-soft); margin: 6px 0 0; }
.qh-gear p { margin: .3em 0; }
.qh-touch-on .qh-gear { top: 84px; }
.qh-menu { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; z-index: 5; }
.qh-menu h2 { margin: 0 0 8px; font-size: 1.1em; color: var(--qh-warn); }
.qh-menu h3 { margin: 12px 0 4px; font-size: .95em; color: #8fd3ff; }
.qh-menu ul { list-style: none; margin: 0; padding: 0; }
.qh-menu li { padding: 6px 0; border-top: 1px solid #2a2f48; }
.qh-menu .head { display: flex; gap: .5em; align-items: baseline; flex-wrap: wrap; }
.qh-menu button { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.qh-menu li .head button:first-of-type { margin-left: auto; }
.qh-menu button:hover:not(:disabled), .qh-menu button:focus-visible { background: #2a3050; outline: 2px solid var(--qh-warn); }
.qh-menu button:disabled { opacity: .45; cursor: default; }
.qh-menu .desc, .qh-menu .hint { color: var(--qh-muted); font-size: .8em; }
.qh-menu .note { color: var(--qh-warn-soft); margin: 6px 0 0; }
.qh-menu p { margin: .4em 0; }
.qh-menu input[type=file] { color: var(--qh-muted); font-size: .8em; max-width: 100%; }
.qh-settings { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; z-index: 6; }
.qh-settings h2 { margin: 0 0 8px; font-size: 1.1em; color: var(--qh-warn); }
.qh-settings h3 { margin: 12px 0 4px; font-size: .95em; color: var(--qh-live-soft); }
.qh-settings .field { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; margin: 6px 0; }
.qh-settings .fname { min-width: 8em; font-weight: 600; }
.qh-settings .fhelp { flex-basis: 100%; color: var(--qh-muted); font-size: .8em; }
.qh-settings select, .qh-settings button { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 4px 10px; }
.qh-settings button { cursor: pointer; }
.qh-settings button:hover, .qh-settings button:focus-visible, .qh-settings select:focus-visible, .qh-settings input:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-settings input[type=checkbox] { width: 1.2em; height: 1.2em; }
.qh-settings .note { color: var(--qh-warn-soft); margin: 6px 0; }
.qh-settings .hint { color: var(--qh-muted); font-size: .8em; }
.qh-settings .tablewrap { overflow-x: auto; margin: 6px 0; }
.qh-settings table { border-collapse: collapse; width: 100%; font-size: .9em; }
.qh-settings th { text-align: left; color: var(--qh-muted); font-weight: 500; padding: 2px 6px; }
.qh-settings td { padding: 3px 6px; border-top: 1px solid #2a2f48; vertical-align: middle; }
.qh-settings td.bad { color: var(--qh-bad); } .qh-settings td.muted { color: var(--qh-muted); }
.qh-terminal { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; }
@media (max-height: 560px) { :root { --cell: 2.9em; } .qh-terminal .hint { display: none; } }
.qh-terminal h2 { margin: 0 0 6px; font-size: 1.1em; color: var(--qh-live-soft); }
.qh-terminal .hint { color: var(--qh-muted); font-size: .85em; margin: 0 0 10px; }
.qh-terminal .status { margin: 0 0 8px; color: var(--qh-warn); font-weight: 600; }
.qh-terminal .granted { margin: 0 0 10px; padding: 8px 10px; border: 1px solid var(--qh-good); border-radius: 6px; background: #12301f; color: var(--qh-good-soft); font-weight: 600; }
.qh-grid { display: grid; grid-template-columns: repeat(var(--cols, 4), var(--cell, 4em)); gap: 0; justify-content: center; margin: 8px 0 12px; border: 1px solid #2f3452; }
.qh-grid .cell { position: relative; width: var(--cell, 4em); height: var(--cell, 4em); background: #151827; border: 1px solid #23273d; border-radius: 0; cursor: pointer; padding: 0; }
.qh-grid .cell:hover:not(:disabled) { background: #1c2036; }
.qh-grid .cell:focus-visible { outline: 3px solid var(--qh-warn); outline-offset: -3px; z-index: 1; }
.qh-grid .cell:disabled { cursor: default; }
.qh-grid .cell svg { width: 100%; height: 100%; display: block; }
.qh-grid .pipe { stroke: #5b6288; stroke-width: 14; }
.qh-grid .hub { fill: #5b6288; }
.qh-grid .cell.on { background: #0f2b35; }
.qh-grid .cell.on .pipe { stroke: var(--qh-live); stroke-width: 16; }
.qh-grid .cell.on .hub { fill: var(--qh-live); }
.qh-grid .core { stroke: var(--qh-live-soft); stroke-width: 6; }
.qh-grid .target { fill: none; stroke: var(--qh-warn); stroke-width: 6; }
.qh-grid .target.on { fill: var(--qh-live-soft); stroke: var(--qh-warn); }
.qh-grid .bolt { fill: var(--qh-warn); stroke: #10121c; stroke-width: 2; }
.qh-grid .sig .wall { fill: #3a3f5c; stroke: #5b6288; stroke-width: 3; }
.qh-grid .sig .mirror { stroke: var(--qh-muted); stroke-width: 9; stroke-linecap: round; }
.qh-grid .sig.on .mirror { stroke: var(--qh-live-soft); }
.qh-grid .sig .beam { fill: var(--qh-live); opacity: .55; }
.qh-grid .sig .hazard { stroke: var(--qh-bad); stroke-width: 9; stroke-linecap: round; }
.qh-grid .sig .hazard.hot { stroke: var(--qh-bad); stroke-width: 14; }
.qh-grid .sig.flip { outline: 1px dashed #5b6288; outline-offset: -4px; }
.qh-grid .sig .bolt { fill: none; stroke: var(--qh-warn); stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; }
.qh-sched { overflow-x: auto; margin: 8px 0 12px; }
.qh-terminal.wide { width: min(720px, calc(100vw - 32px)); }
.qh-sched .row { display: grid; grid-template-columns: 9em repeat(var(--slots, 12), minmax(2.2em, 1fr)); gap: 2px; align-items: center; margin-bottom: 4px; }
.qh-sched .slot { text-align: center; color: #5b6288; font-size: .85em; }
.qh-sched .head .slot { color: var(--qh-muted); font-size: .8em; white-space: nowrap; }
.qh-sched .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qh-sched .slot.busy { color: var(--qh-live-soft); background: #0f2b35; border-radius: 3px; }
.qh-sched .slot.clash { color: var(--qh-bad); background: #3a1220; font-weight: 700; }
.qh-sched .name { text-align: left; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 4px 6px; }
.qh-sched .name:not(:disabled) { cursor: pointer; }
.qh-sched .name:hover:not(:disabled), .qh-sched .name:focus-visible { background: #2a3050; outline: 2px solid var(--qh-warn); }
.qh-sched .reqs { list-style: none; margin: 6px 0 0; padding: 0; color: var(--qh-warn-soft); font-size: .85em; }
.qh-sched .reqs .met { color: var(--qh-good-soft); }
.qh-board .brow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.qh-board .blabel { color: var(--qh-muted); font-size: .85em; min-width: 5em; }
.qh-board .bctl { min-width: 2.4em; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.qh-board .bctl.on { background: #0f2b35; border-color: var(--qh-live); color: var(--qh-live-soft); }
.qh-board .bctl.static { background: transparent; border-color: transparent; cursor: default; color: var(--qh-text); }
.qh-board .bctl:hover:not(:disabled), .qh-board .bctl:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-board .bctl:disabled:not(.static) { opacity: .75; cursor: default; }
.qh-board .bplay { margin: 4px 0 6px; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.qh-board .bplay:hover, .qh-board .bplay:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-board .bline { margin: 3px 0; font-size: .9em; color: #c8cce6; }
.qh-board .bline.mono { font-family: monospace; white-space: pre-wrap; word-break: break-all; }
.qh-board .bline.good { color: var(--qh-good-soft); }
.qh-board .bline.bad { color: var(--qh-bad-soft); }
.qh-board .bline.hint { color: var(--qh-muted); font-size: .8em; }
.qh-board .bplot { width: min(220px, 100%); height: auto; display: block; margin: 8px 0; border: 1px solid #2f3452; }
.qh-board .bplot .zin { fill: var(--qh-live); opacity: .35; }
.qh-board .bplot .zout { fill: #8a3a5a; opacity: .25; }
.qh-board .bplot .pt { stroke: var(--qh-text); stroke-width: 1.4; fill: var(--qh-text); }
.qh-board .bplot .pt.test { fill: none; }
.qh-lock .lockhint { color: var(--qh-warn-soft); font-size: .9em; margin: 0 0 8px; text-align: center; }
.qh-lock .dials { display: flex; gap: 8px; justify-content: center; margin: 8px 0 12px; }
.qh-lock .dial { width: 2.6em; height: 3.2em; background: #151827; color: var(--qh-live-soft); font: 700 1.6em/1 monospace; border: 1px solid #3a3f5c; border-radius: 6px; cursor: pointer; }
.qh-lock .dial:hover:not(:disabled), .qh-lock .dial:focus-visible { outline: 2px solid var(--qh-warn); background: #1c2036; }
.qh-grid .fuse { font-size: 1.6em; color: #5b6288; }
.qh-grid .fuse.on { color: var(--qh-warn); background: #2a2410; }
.qh-rules h3 { margin: 10px 0 4px; font-size: .9em; color: #8fd3ff; }
.qh-rules .inputs { display: flex; flex-wrap: wrap; gap: 6px; }
.qh-rules .input { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.qh-rules .input.on { background: #0f2b35; border-color: var(--qh-live); }
.qh-rules .input:hover:not(:disabled), .qh-rules .input:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-rules ul { list-style: none; margin: 0; padding: 0; font-size: .9em; }
.qh-rules li { padding: 3px 0; color: var(--qh-muted); }
.qh-drawing { margin: 6px 0 10px; }
.qh-diagram { width: 100%; height: auto; display: block; background: #0a0c18; border: 1px solid #2f3452; border-radius: 6px; }
.qh-diagram .wire { fill: none; }
.qh-diagram .wire.on { stroke: var(--qh-live); stroke-width: 3; }
.qh-diagram .wire.off { stroke: #6a7299; stroke-width: 1.6; stroke-dasharray: 5 4; }
.qh-diagram .node rect { fill: #161a2e; stroke: #5a6392; stroke-width: 1.5; }
.qh-diagram .node.on rect { fill: #14283a; stroke: var(--qh-live); stroke-width: 2; }
.qh-diagram .node.rule.on rect { fill: #2a2410; stroke: var(--qh-warn); }
.qh-diagram .node.lamp .bulb { fill: none; stroke: #aab1d6; stroke-width: 2; }
.qh-diagram .node.lamp.on .bulb { fill: var(--qh-warn); stroke: var(--qh-warn); }
.qh-diagram .node.unmet rect { stroke: var(--qh-bad); stroke-width: 2; }
.qh-diagram .node.clash rect { fill: #3a1424; stroke: var(--qh-bad); stroke-width: 2.5; }
.qh-diagram .node.tappable { cursor: pointer; }
.qh-diagram .node.tappable:hover rect { stroke: var(--qh-warn); }
.qh-diagram text { fill: #f1f3ff; font: 600 11px system-ui, sans-serif; text-anchor: middle; pointer-events: none; }
.qh-diagram text.op { font-size: 13px; letter-spacing: .04em; }
.qh-diagram text.state { fill: var(--qh-muted); font-weight: 500; font-size: 10px; }
.qh-diagram .node.on text.state { fill: var(--qh-live-soft); }
.qh-diagram .node.rule.on text.state { fill: var(--qh-warn-soft); }
.qh-diagram .node.clash text { fill: var(--qh-bad-soft); }
.qh-diagram text.body { font-weight: 400; font-size: 11px; fill: #dfe3f8; }
.qh-diagram text.left { text-anchor: start; }
.qh-diagram text.head { fill: #8fa0e0; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.qh-diagram text.wlabel { fill: #8e97c2; font-size: 9px; font-weight: 500; paint-order: stroke; stroke: #0a0c18; stroke-width: 3px; }
.qh-diagram text.wlabel.on { fill: var(--qh-live-soft); }
.qh-diagram text.wlabel.end { text-anchor: end; }
.qh-diagram text.wlabel.start { text-anchor: start; }
.qh-rules li .chain { font-family: monospace; font-size: .8em; color: var(--qh-muted); font-weight: 400; word-break: break-word; margin: 1px 0 4px 1.4em; }
.qh-rules li.applies { color: var(--qh-text); }
.qh-rules li.bad { color: var(--qh-bad-soft); font-weight: 700; }
.qh-terminal .skip { width: 100%; margin-bottom: 8px; background: #2a2410; color: var(--qh-warn-soft); font: inherit; border: 1px solid var(--qh-warn); border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-terminal .skip:hover, .qh-terminal .skip:focus-visible { outline: 2px solid var(--qh-warn); }
.qh-terminal .leave { width: 100%; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-terminal .leave:hover, .qh-terminal .leave:focus-visible { background: #2a3050; outline: 2px solid var(--qh-warn); }
`;
