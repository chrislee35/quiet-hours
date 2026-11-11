/** Overlay styles. Font size is one variable so text scaling (ACC-3) is a single setting later. */
export const OVERLAY_CSS = `
:root { --qh-font: 16px; }
.qh-panel { position: fixed; background: #10121cf2; color: #dfe2f3; font: var(--qh-font)/1.45 system-ui, sans-serif;
  border: 1px solid #3a3f5c; border-radius: 8px; padding: 14px 16px; box-sizing: border-box; }
.qh-hud { left: 12px; top: 12px; font-size: .8em; line-height: 1.35; padding: 8px 10px; pointer-events: none; max-width: calc(100vw - 24px); }
.qh-hud div:nth-child(1) { font-weight: 600; color: #ffd36b; }
.qh-hud div:nth-child(4) { color: #ff9a9a; min-height: 1.35em; }
.qh-hud div:nth-child(5), .qh-hud div:nth-child(6) { color: #8b91b5; }
.qh-dialogue { left: 50%; transform: translateX(-50%); bottom: 16px; width: min(760px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; }
.qh-dialogue h2 { margin: 0 0 2px; font-size: 1.1em; color: #ffd36b; }
.qh-dialogue .mood { font-weight: 400; color: #9aa0c4; font-size: .85em; margin-left: .4em; }
.qh-dialogue .trust { color: #9aa0c4; font-size: .85em; margin: 0 0 8px; font-style: italic; }
.qh-dialogue p { margin: .4em 0; }
.qh-dialogue .notice { margin: 8px 0; padding: 6px 10px; border-left: 3px solid #ffd36b; background: #1b1f33; color: #ffe9a8; font-size: .9em; }
.qh-dialogue .speaker { color: #8fd3ff; }
.qh-choices { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.qh-choices button, .qh-picker button { text-align: left; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c;
  border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-choices button:hover, .qh-choices button:focus-visible, .qh-picker button:hover, .qh-picker button:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
.qh-choices .key { color: #ffd36b; margin-right: .6em; }
.qh-picker { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.qh-notebook { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; z-index: 4; }
.qh-notebook h2 { margin: 0 0 8px; font-size: 1.1em; color: #ffd36b; }
.qh-notebook ul { list-style: none; margin: 0; padding: 0; }
.qh-notebook li { padding: 7px 0; border-top: 1px solid #2a2f48; }
.qh-notebook .from { color: #9aa0c4; font-size: .8em; }
.qh-notebook .status { font-size: .8em; margin-left: .4em; }
.qh-notebook .verified { color: #7fe08a; } .qh-notebook .disproved { color: #ff7a8a; text-decoration: line-through; }
.qh-notebook .hint { color: #9aa0c4; font-size: .8em; margin-top: 8px; }
.qh-notebook .tabs { display: flex; gap: 6px; margin: 0 0 10px; }
.qh-notebook button, .qh-notebook select, .qh-notebook input[type=search] { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 10px; }
.qh-notebook button { cursor: pointer; }
.qh-notebook button.on { background: #0f2b35; border-color: #1d8da3; color: #dff9ff; }
.qh-notebook button.small { font-size: .8em; padding: 2px 8px; margin: 3px 4px 0 0; }
.qh-notebook button:hover, .qh-notebook button:focus-visible, .qh-notebook input:focus-visible, .qh-notebook select:focus-visible { outline: 2px solid #ffd36b; }
.qh-notebook .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.qh-notebook .bar input { flex: 1 1 12em; min-width: 0; }
.qh-notebook .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.qh-notebook .conflict { margin: 6px 0; padding: 6px 10px; border-left: 3px solid #ff7a8a; background: #2a1620; color: #ffd6de; font-size: .9em; }
.qh-notebook .conflict.settled { border-color: #7fe08a; background: #14281c; color: #c8f5d2; }
.qh-notebook .linking { margin: 6px 0; padding: 6px 10px; border-left: 3px solid #ffd36b; background: #2a2410; color: #ffe9a8; font-size: .9em; }
.qh-notebook .rel { color: #bcc3e6; font-size: .8em; margin-top: 2px; }
.qh-notebook .rel.contradicts { color: #ffb0bd; }
.qh-notebook .rel.mine { color: #ffe39a; }
.qh-notebook .quests > li.complete .qhead strong, .qh-notebook .quests > li.failed .qhead strong { opacity: .7; }
.qh-notebook .steps { margin: 4px 0 0 .4em; }
.qh-notebook .steps li { border: 0; padding: 1px 0; color: #c8cce6; font-size: .9em; }
.qh-notebook .steps li.done { color: #8dfbb4; }
.qh-notebook .legend li { border-top: 1px solid #2a2f48; }
.qh-map { width: 100%; height: auto; display: block; background: #0a0c18; border: 1px solid #2f3452; border-radius: 6px; margin-bottom: 8px; }
.qh-map .mwall { fill: #2c3150; }
.qh-map .mzone rect { fill: #1d8da3; opacity: .22; }
.qh-map .mzone.p1 rect, .qh-map .mzone.p2 rect { fill: #e0b43c; opacity: .25; }
.qh-map .mzone.p3 rect { fill: #ff6b86; opacity: .28; }
.qh-map text { font: 600 10px system-ui, sans-serif; fill: #e9ecff; text-anchor: middle; paint-order: stroke; stroke: #0a0c18; stroke-width: 3px; pointer-events: none; }
.qh-map text.left { text-anchor: start; fill: #b9c2f0; font-weight: 500; }
.qh-map .mpin.place { fill: #ffd36b; stroke: #0a0c18; stroke-width: 1.5; }
.qh-map .mpin.person { fill: #8fd3ff; stroke: #0a0c18; stroke-width: 1.5; }
.qh-map .mpin.you { fill: #7fe08a; stroke: #0a0c18; stroke-width: 1.5; }
.qh-gear { left: 16px; top: 120px; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 140px); overflow: auto; }
.qh-gear h2 { margin: 0 0 8px; font-size: 1.1em; color: #ffd36b; }
.qh-gear h3 { margin: 12px 0 4px; font-size: .95em; color: #8fd3ff; }
.qh-gear .meters { font-weight: 600; color: #8ff6ff; margin: 0 0 6px; }
.qh-gear ul { list-style: none; margin: 0; padding: 0; }
.qh-gear li { padding: 6px 0; border-top: 1px solid #2a2f48; }
.qh-gear .head { display: flex; gap: .5em; align-items: baseline; flex-wrap: wrap; }
.qh-gear .head button { margin-left: auto; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.qh-gear .head button:hover, .qh-gear .head button:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
.qh-gear .cost, .qh-gear .desc, .qh-gear .hint { color: #9aa0c4; font-size: .8em; }
.qh-gear .note { color: #ff9a9a; margin: 6px 0 0; }
.qh-gear p { margin: .3em 0; }
.qh-touch-on .qh-gear { top: 84px; }
.qh-menu { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; z-index: 5; }
.qh-menu h2 { margin: 0 0 8px; font-size: 1.1em; color: #ffd36b; }
.qh-menu h3 { margin: 12px 0 4px; font-size: .95em; color: #8fd3ff; }
.qh-menu ul { list-style: none; margin: 0; padding: 0; }
.qh-menu li { padding: 6px 0; border-top: 1px solid #2a2f48; }
.qh-menu .head { display: flex; gap: .5em; align-items: baseline; flex-wrap: wrap; }
.qh-menu button { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.qh-menu li .head button:first-of-type { margin-left: auto; }
.qh-menu button:hover:not(:disabled), .qh-menu button:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
.qh-menu button:disabled { opacity: .45; cursor: default; }
.qh-menu .desc, .qh-menu .hint { color: #9aa0c4; font-size: .8em; }
.qh-menu .note { color: #ffe9a8; margin: 6px 0 0; }
.qh-menu p { margin: .4em 0; }
.qh-menu input[type=file] { color: #9aa0c4; font-size: .8em; max-width: 100%; }
.qh-terminal { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 24px); overflow: auto; }
@media (max-height: 560px) { :root { --cell: 2.9em; } .qh-terminal .hint { display: none; } }
.qh-terminal h2 { margin: 0 0 6px; font-size: 1.1em; color: #7be3ff; }
.qh-terminal .hint { color: #9aa0c4; font-size: .85em; margin: 0 0 10px; }
.qh-terminal .status { margin: 0 0 8px; color: #ffd36b; font-weight: 600; }
.qh-terminal .granted { margin: 0 0 10px; padding: 8px 10px; border: 1px solid #2c8a52; border-radius: 6px; background: #12301f; color: #8dfbb4; font-weight: 600; }
.qh-grid { display: grid; grid-template-columns: repeat(var(--cols, 4), var(--cell, 4em)); gap: 0; justify-content: center; margin: 8px 0 12px; border: 1px solid #2f3452; }
.qh-grid .cell { position: relative; width: var(--cell, 4em); height: var(--cell, 4em); background: #151827; border: 1px solid #23273d; border-radius: 0; cursor: pointer; padding: 0; }
.qh-grid .cell:hover:not(:disabled) { background: #1c2036; }
.qh-grid .cell:focus-visible { outline: 3px solid #ffd36b; outline-offset: -3px; z-index: 1; }
.qh-grid .cell:disabled { cursor: default; }
.qh-grid .cell svg { width: 100%; height: 100%; display: block; }
.qh-grid .pipe { stroke: #5b6288; stroke-width: 14; }
.qh-grid .hub { fill: #5b6288; }
.qh-grid .cell.on { background: #0f2b35; }
.qh-grid .cell.on .pipe { stroke: #1d8da3; stroke-width: 16; }
.qh-grid .cell.on .hub { fill: #1d8da3; }
.qh-grid .core { stroke: #8ff6ff; stroke-width: 6; }
.qh-grid .target { fill: none; stroke: #ffd36b; stroke-width: 6; }
.qh-grid .target.on { fill: #8ff6ff; stroke: #ffd36b; }
.qh-grid .bolt { fill: #ffd36b; stroke: #10121c; stroke-width: 2; }
.qh-grid .sig .wall { fill: #3a3f5c; stroke: #5b6288; stroke-width: 3; }
.qh-grid .sig .mirror { stroke: #9aa0c4; stroke-width: 9; stroke-linecap: round; }
.qh-grid .sig.on .mirror { stroke: #8ff6ff; }
.qh-grid .sig .beam { fill: #1d8da3; opacity: .55; }
.qh-grid .sig .hazard { stroke: #ff7a8a; stroke-width: 9; stroke-linecap: round; }
.qh-grid .sig .hazard.hot { stroke: #ff3355; stroke-width: 14; }
.qh-grid .sig.flip { outline: 1px dashed #5b6288; outline-offset: -4px; }
.qh-grid .sig .bolt { fill: none; stroke: #ffd36b; stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; }
.qh-sched { overflow-x: auto; margin: 8px 0 12px; }
.qh-terminal.wide { width: min(720px, calc(100vw - 32px)); }
.qh-sched .row { display: grid; grid-template-columns: 9em repeat(var(--slots, 12), minmax(2.2em, 1fr)); gap: 2px; align-items: center; margin-bottom: 4px; }
.qh-sched .slot { text-align: center; color: #5b6288; font-size: .85em; }
.qh-sched .head .slot { color: #9aa0c4; font-size: .8em; white-space: nowrap; }
.qh-sched .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qh-sched .slot.busy { color: #8ff6ff; background: #0f2b35; border-radius: 3px; }
.qh-sched .slot.clash { color: #ff3355; background: #3a1220; font-weight: 700; }
.qh-sched .name { text-align: left; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 4px 6px; }
.qh-sched .name:not(:disabled) { cursor: pointer; }
.qh-sched .name:hover:not(:disabled), .qh-sched .name:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
.qh-sched .reqs { list-style: none; margin: 6px 0 0; padding: 0; color: #ffe9a8; font-size: .85em; }
.qh-sched .reqs .met { color: #8dfbb4; }
.qh-board .brow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.qh-board .blabel { color: #9aa0c4; font-size: .85em; min-width: 5em; }
.qh-board .bctl { min-width: 2.4em; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.qh-board .bctl.on { background: #0f2b35; border-color: #1d8da3; color: #dff9ff; }
.qh-board .bctl.static { background: transparent; border-color: transparent; cursor: default; color: #dfe2f3; }
.qh-board .bctl:hover:not(:disabled), .qh-board .bctl:focus-visible { outline: 2px solid #ffd36b; }
.qh-board .bctl:disabled:not(.static) { opacity: .75; cursor: default; }
.qh-board .bplay { margin: 4px 0 6px; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.qh-board .bplay:hover, .qh-board .bplay:focus-visible { outline: 2px solid #ffd36b; }
.qh-board .bline { margin: 3px 0; font-size: .9em; color: #c8cce6; }
.qh-board .bline.mono { font-family: monospace; white-space: pre-wrap; word-break: break-all; }
.qh-board .bline.good { color: #8dfbb4; }
.qh-board .bline.bad { color: #ff9a9a; }
.qh-board .bline.hint { color: #9aa0c4; font-size: .8em; }
.qh-board .bplot { width: min(220px, 100%); height: auto; display: block; margin: 8px 0; border: 1px solid #2f3452; }
.qh-board .bplot .zin { fill: #1d8da3; opacity: .35; }
.qh-board .bplot .zout { fill: #8a3a5a; opacity: .25; }
.qh-board .bplot .pt { stroke: #dfe2f3; stroke-width: 1.4; fill: #dfe2f3; }
.qh-board .bplot .pt.test { fill: none; }
.qh-lock .lockhint { color: #ffe9a8; font-size: .9em; margin: 0 0 8px; text-align: center; }
.qh-lock .dials { display: flex; gap: 8px; justify-content: center; margin: 8px 0 12px; }
.qh-lock .dial { width: 2.6em; height: 3.2em; background: #151827; color: #8ff6ff; font: 700 1.6em/1 monospace; border: 1px solid #3a3f5c; border-radius: 6px; cursor: pointer; }
.qh-lock .dial:hover:not(:disabled), .qh-lock .dial:focus-visible { outline: 2px solid #ffd36b; background: #1c2036; }
.qh-grid .fuse { font-size: 1.6em; color: #5b6288; }
.qh-grid .fuse.on { color: #ffd36b; background: #2a2410; }
.qh-rules h3 { margin: 10px 0 4px; font-size: .9em; color: #8fd3ff; }
.qh-rules .inputs { display: flex; flex-wrap: wrap; gap: 6px; }
.qh-rules .input { background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.qh-rules .input.on { background: #0f2b35; border-color: #1d8da3; }
.qh-rules .input:hover:not(:disabled), .qh-rules .input:focus-visible { outline: 2px solid #ffd36b; }
.qh-rules ul { list-style: none; margin: 0; padding: 0; font-size: .9em; }
.qh-rules li { padding: 3px 0; color: #9aa0c4; }
.qh-drawing { margin: 6px 0 10px; }
.qh-diagram { width: 100%; height: auto; display: block; background: #0a0c18; border: 1px solid #2f3452; border-radius: 6px; }
.qh-diagram .wire { fill: none; }
.qh-diagram .wire.on { stroke: #5fd6ee; stroke-width: 3; }
.qh-diagram .wire.off { stroke: #6a7299; stroke-width: 1.6; stroke-dasharray: 5 4; }
.qh-diagram .node rect { fill: #161a2e; stroke: #5a6392; stroke-width: 1.5; }
.qh-diagram .node.on rect { fill: #14283a; stroke: #4cc3dd; stroke-width: 2; }
.qh-diagram .node.rule.on rect { fill: #2a2410; stroke: #e0b43c; }
.qh-diagram .node.lamp .bulb { fill: none; stroke: #aab1d6; stroke-width: 2; }
.qh-diagram .node.lamp.on .bulb { fill: #ffd36b; stroke: #ffd36b; }
.qh-diagram .node.unmet rect { stroke: #ff7f95; stroke-width: 2; }
.qh-diagram .node.clash rect { fill: #3a1424; stroke: #ff6b86; stroke-width: 2.5; }
.qh-diagram .node.tappable { cursor: pointer; }
.qh-diagram .node.tappable:hover rect { stroke: #ffd36b; }
.qh-diagram text { fill: #f1f3ff; font: 600 11px system-ui, sans-serif; text-anchor: middle; pointer-events: none; }
.qh-diagram text.op { font-size: 13px; letter-spacing: .04em; }
.qh-diagram text.state { fill: #bcc3e6; font-weight: 500; font-size: 10px; }
.qh-diagram .node.on text.state { fill: #a6ecff; }
.qh-diagram .node.rule.on text.state { fill: #ffe39a; }
.qh-diagram .node.clash text { fill: #ffe0e6; }
.qh-diagram text.body { font-weight: 400; font-size: 11px; fill: #dfe3f8; }
.qh-diagram text.left { text-anchor: start; }
.qh-diagram text.head { fill: #8fa0e0; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.qh-diagram text.wlabel { fill: #8e97c2; font-size: 9px; font-weight: 500; paint-order: stroke; stroke: #0a0c18; stroke-width: 3px; }
.qh-diagram text.wlabel.on { fill: #a6ecff; }
.qh-diagram text.wlabel.end { text-anchor: end; }
.qh-diagram text.wlabel.start { text-anchor: start; }
.qh-rules li .chain { font-family: monospace; font-size: .8em; color: #9aa0c4; font-weight: 400; word-break: break-word; margin: 1px 0 4px 1.4em; }
.qh-rules li.applies { color: #dfe2f3; }
.qh-rules li.bad { color: #ff9a9a; font-weight: 700; }
.qh-terminal .leave { width: 100%; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-terminal .leave:hover, .qh-terminal .leave:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
`;
