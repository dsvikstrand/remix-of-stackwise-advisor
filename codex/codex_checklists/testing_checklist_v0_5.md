# Test Checklist (Manual) - v0_5 (Delta)

Only validate the changes introduced in v0_5.

---

Task 1: Post button location + label
- do this/task: Confirm Post is near the analysis area (not in header)
- how to do it: Open /blend and /protein after analysis is available
- expected outcome: Post button appears near analysis panel and is text-only
- feedback: yup

Task 2: Default public + shareable
- do this/task: Verify Post dialog defaults to sharing publicly
- how to do it: Click Post on /blend or /protein and inspect dialog defaults
- expected outcome: Post to Wall is ON by default; visibility defaults to Public
- feedback: yup

Task 3: Post detail page (comments)
- do this/task: Open a post detail page and confirm comments are there
- how to do it: On /wall, click View on a post
- expected outcome: Post detail shows full thread + Top/Latest toggle
- feedback: this gives me an error
"
Runtime error

today at 6:09 PM

Dismiss
Uncaught ReferenceError: Link is not defined

{
  "timestamp": 1769274560093,
  "error_type": "RUNTIME_ERROR",
  "filename": "https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js",
  "lineno": 38,
  "colno": 3319,
  "stack": "ReferenceError: Link is not defined\n    at https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:517:24594\n    at Array.map (<anonymous>)\n    at Yz (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:517:24581)\n    at am (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:38:16998)\n    at mf (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:3139)\n    at ub (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:44737)\n    at ab (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:39727)\n    at YP (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:39655)\n    at cu (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:39508)\n    at kf (https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app/assets/index-CNYHUsXH.js:40:35875)",
  "has_blank_screen": true
}
"

Task 4: Wall is sign-in gated
- do this/task: Confirm Wall requires login
- how to do it: Log out, visit /wall
- expected outcome: Redirects to /auth
- feedback: yep but still let my toggle between tha pages even at the log in page (blen/protein/more)

Task 5: Like UI fix
- do this/task: Like a post on Wall
- how to do it: While signed in, click the heart on a Wall card
- expected outcome: Heart fills immediately and count updates without refresh
- feedback: yup

Task 6: Tag mute removal
- do this/task: Confirm mute controls are gone
- how to do it: Visit /tags
- expected outcome: Only Follow/Unfollow is shown (no Mute/Unmute)
- feedback: yep

---

Notes:
- Fill feedback with pass/fail + short notes.
- If something fails, include steps to reproduce.