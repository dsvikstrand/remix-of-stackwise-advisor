# Test Checklist (Manual)

Use this doc to validate core flows. Fill the "feedback" field after each task.

---

Task 1: Create account
- do this/task: Create a new user account
- how to do it: Go to /auth, open Sign Up tab, enter email + password + display name, submit
- expected outcome: Account is created, you are redirected to the app, and the user menu shows your name
- feedback: yep, should we add some email confirmation here to avoid bots?

Task 2: Sign out / sign in
- do this/task: Sign out and sign back in
- how to do it: Open user menu -> Sign Out. Then go to /auth, sign in
- expected outcome: You can log out and log back in, profile persists
- feedback: check

Task 3: Create a Blend
- do this/task: Build a new blend and analyze it
- how to do it: Go to /blend, pick 2-3 supplements, set doses, click MIX
- expected outcome: Streaming analysis appears and is saved in the blend history
- feedback: yep history works

Task 4: Save a recipe (private)
- do this/task: Save a Blend recipe as private
- how to do it: On /blend, click Save, keep visibility Private, save
- expected outcome: Recipe shows in My Recipes with Private status
- feedback: yep, but i dont like where the save icon is. since its in the header it can be ahrd to find. i would rather keep it closer to the inventory or the review. aI also dont want to use the "disc" icon for save. 

Task 5: Share a recipe to Wall (public + tags)
- do this/task: Share a recipe to the Wall with tags
- how to do it: On /blend or /my-recipes, click Share, add tags (max 4), optional caption, submit
- expected outcome: Recipe becomes Public and appears on Wall with tags and caption
- feedback: so lets keep public on by default, such that the user needs to mark it as private, (instead of the other way around)

Task 6: Recent tags
- do this/task: Use recent tags during share
- how to do it: Share another recipe and select tags from the Recent tags row
- expected outcome: Recent tags appear, can be added with one click
- feedback: yep

Task 7: Tag Directory follow/mute
- do this/task: Follow and mute a tag
- how to do it: Go to /tags, search for a tag, click Follow, then Mute
- expected outcome: Tag shows following and muted states correctly
- feedback: yep this works. But i think we can skip "mute" for now. I find that it brings a "negative" feel, hopefully there will be no need to mute. if we get alot of "slop" we can introduce mute again. SO lets remove mute for now.

Task 8: For You feed
- do this/task: Validate For You feed uses followed tags and excludes muted tags
- how to do it: Go to /wall -> For You; follow a tag that has posts; mute it and check again
- expected outcome: Followed tag posts appear; muted tag posts disappear
- feedback: yep this seems to work

Task 9: Comments (threaded)
- do this/task: Add a comment and a reply, then edit
- how to do it: On a Wall post, open Comments, add a comment, reply to it, then edit your reply
- expected outcome: Comment thread shows replies; edit shows �(edited)�
- feedback: yup. but can we instead do this more "reddit" style, such that we only display the comments if a user opens the post, where a dedicated view of the post and its comment are displayed, instead of the full conv/comments on the wall.

Task 10: Comments sort
- do this/task: Switch comment sorting
- how to do it: In Comments, toggle Top / Latest
- expected outcome: Order changes (Top by likes, Latest by time)
- feedback: yep

Task 11: Like and Save
- do this/task: Like a post and save it
- how to do it: On Wall, click Like and Save on a post
- expected outcome: Like count updates; Saved tab shows the post
- feedback: i can like comments, but the hear never activates on the main post if i click on it. saved seems to work

Task 12: Saved tab (logged out)
- do this/task: Check Saved tab when logged out
- how to do it: Log out, go to /wall -> Saved
- expected outcome: Prompt asks you to sign in to view saved posts
- feedback: yep but hide latest and trending from non logged ion users aswell

Task 13: Profile update
- do this/task: Update profile settings
- how to do it: Go to /profile, change display name + avatar URL + bio, save
- expected outcome: User menu reflects new display name; profile saves
- feedback: yep

Task 14: Tag chip navigation
- do this/task: Navigate from Wall tag chip to Tag Directory
- how to do it: Click a tag chip on a Wall post
- expected outcome: Tag Directory opens with search prefilled
- feedback: yep

Task 15: Navigation header
- do this/task: Confirm common header works across pages
- how to do it: Visit /, /blend, /protein, /wall, /tags, /my-recipes
- expected outcome: Same header navigation appears and routes correctly
- feedback:yep

---

Notes:
- Fill feedback with pass/fail + short notes.
- If something fails, include steps to reproduce.