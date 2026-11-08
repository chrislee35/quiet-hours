/** Overlay styles. Font size is one variable so text scaling (ACC-3) is a single setting later. */
export const OVERLAY_CSS = `
:root { --qh-font: 16px; }
.qh-panel { position: fixed; background: #10121cf2; color: #dfe2f3; font: var(--qh-font)/1.45 system-ui, sans-serif;
  border: 1px solid #3a3f5c; border-radius: 8px; padding: 14px 16px; box-sizing: border-box; }
.qh-dialogue { left: 50%; transform: translateX(-50%); bottom: 16px; width: min(760px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; }
.qh-dialogue h2 { margin: 0 0 2px; font-size: 1.1em; color: #ffd36b; }
.qh-dialogue .mood { font-weight: 400; color: #9aa0c4; font-size: .85em; margin-left: .4em; }
.qh-dialogue .trust { color: #9aa0c4; font-size: .85em; margin: 0 0 8px; font-style: italic; }
.qh-dialogue p { margin: .4em 0; }
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
`;
