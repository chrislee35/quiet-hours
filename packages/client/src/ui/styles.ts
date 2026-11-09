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
.qh-notebook { right: 16px; top: 16px; width: min(380px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; }
.qh-notebook h2 { margin: 0 0 8px; font-size: 1.1em; color: #ffd36b; }
.qh-notebook ul { list-style: none; margin: 0; padding: 0; }
.qh-notebook li { padding: 6px 0; border-top: 1px solid #2a2f48; }
.qh-notebook .from { color: #9aa0c4; font-size: .8em; }
.qh-notebook .status { font-size: .8em; margin-left: .4em; }
.qh-notebook .verified { color: #7fe08a; } .qh-notebook .disproved { color: #ff7a8a; text-decoration: line-through; }
.qh-notebook .hint { color: #9aa0c4; font-size: .8em; margin-top: 8px; }
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
.qh-terminal .leave { width: 100%; background: #1b1f33; color: inherit; font: inherit; border: 1px solid #3a3f5c; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
.qh-terminal .leave:hover, .qh-terminal .leave:focus-visible { background: #2a3050; outline: 2px solid #ffd36b; }
`;
