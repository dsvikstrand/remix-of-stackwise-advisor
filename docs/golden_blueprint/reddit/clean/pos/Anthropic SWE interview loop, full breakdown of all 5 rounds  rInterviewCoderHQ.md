Anthropic infrastructure SWE, five rounds, three weeks.

Online Assessment

90 minutes, two problems. First was LRU Cache in Python, sounds easy right? Except they wanted production quality, thread safety, error handling, complexity analysis in comments. Used OrderedDict first which was clean but then they asked me to implement it from scratch with a doubly linked list and hashmap. The pointer updates on eviction took me way too long. Second was a task management system with priorities, worker assignment, and dependencies plus cascading cancellation. Used a DAG with topological sort. Nearly forgot circular dependency detection, added it with like 8 minutes left, would not describe that as my finest moment.

Coding Round 1

Web crawler. BFS from a start URL, crawl to a depth, extract links, build a site map, rate limit yourself, dedup, respect robots.txt. Started single threaded, interviewer immediately asked to make it concurrent so I went asyncio with a semaphore. The robots.txt parsing turned into this whole thing and she just kept throwing edge cases at me the entire time. Redirect loops, relative vs absolute URLs, pages that hang for 30 seconds. Handled most of them but my timeout logic was admittedly janky and she noticed.

System Design

Ok THIS was the round, if you only prepare for one thing at Anthropic make it this.

Design an inference API for serving large language models. Variable-length requests, GPU memory management across concurrent requests, request queuing with priority, streaming responses. This is literally what they build so they go deep.

Batching strategy was the main discussion, how to dynamically group requests of similar length to maximize GPU utilization, when to flush vs hold for one more request. KV cache management came up too. For autoscaling I argued queue depth weighted by estimated token count is a better scaling signal than raw GPU util because util can look fine while latency is tanking, and the interviewer seemed to like that.

I was prepared for this one and it showed. Lucky because if I bombed it I dont think the rest would have saved me.

Coding Round 2

By this point I was genuinely tired. Converting stack sampling profiler output into trace events, you get periodic call stack snapshots and reconstruct when each function started and stopped. Diffing consecutive samples to detect enters and exits. The recursive function case was the catch, same function multiple times in one stack means you track by position not name. Got through the main implementation but I could feel there was a follow up we never reached. Weakest round and I knew it walking out.

Hiring Manager

45 min, infra team lead. Past projects, debugging process, scaling challenges. Best part was he described two approaches to a real problem on their team and asked which Id pick. I went with the simpler one and said flexibility you dont need yet is just complexity you pay for now. He pushed back a little but seemed satisfied.

Got the offer. Concurrency shows up in basically every round so be comfortable with it. And seriously read up on inference serving and GPU scheduling before you go in, their system design round is very specific to what they actually do.
