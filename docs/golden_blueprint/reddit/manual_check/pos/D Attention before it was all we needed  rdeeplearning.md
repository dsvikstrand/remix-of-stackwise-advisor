There is also some work in 2016 using LSTM with attention for TTS.  The original Tacotron paper cites this one as the only known attention-based work on TTS (although it's the same first author as the Tacotron paper)

[https://www.isca-archive.org/interspeech\_2016/wang16e\_interspeech.html](https://www.isca-archive.org/interspeech_2016/wang16e_interspeech.html)

Tacotron (2017) is an interesting case because it uses this "location-aware attention" formulation that actually helps it perform better than Transformers for this task. Better in the sense that since the task is to scan exactly once through the input producing frames corresponding to each phoneme in order, the location-aware attention is an inductive bias that helps it do that correctly.

Tacotron: [https://arxiv.org/abs/1703.10135](https://arxiv.org/abs/1703.10135)

These days TTS is transformer-based, but it takes a magnitude more data or so to stop it skipping or repeating words etc. Several tricks can be found later in literature to help restore this monotonicity property that Tacotron's attention formulation just naturally had.

It's interesting to see the complexity ramp up compared to past papers as well.

yup, esp in the sense of parameters. These models were super tiny compared to today's standard.

Good times when you could do DL research on a single Linux box with a gpu

The mikolov paper on word2vec is good.

Neural Turing Machines paper as well

cool, looks interesting. Thanks for sharing

Yes! Interestingly, I was looking at this article the other day. It's in a really primitive form here, but it can still be understood as a very early use of attention. Thanks for sharing.

Also take a look at residual connections from the resnet paper. The same idea was done before by schmidhuber with his highway networks with gated connections

compression-aware intelligence (CAI) treats hallucinations, identity drift, and reasoning collapse not as output errors but as structural consequences of compression strain within intermediate representations. it provides instrumentation to detect where representations are conflicting and routing strategies that stabilize reasoning rather than patch outputs

it’s a fundamentally different design layer than prompting or RAG

This is a great thread — most discussions jump straight from RNNs to “Attention Is All You Need” without acknowledging the groundwork.

The progression across these papers is really interesting:

• **End-to-End Memory Networks (2015)** introduced multi-hop attention over memory, which already hinted at iterative reasoning.
• **Key-Value Memory Networks (2016)** made a key distinction (literally) between _where_ to attend and _what_ content to retrieve — something that feels very close to later Q/K/V ideas.
• **Bahdanau et al. (2014)** showed attention as alignment, not just a helper mechanism — especially impactful for translation.

What’s fascinating is that many of these models were _explicitly structured_ around memory and reasoning, whereas Transformers later traded structure for scale and parallelism.

Curious if anyone has pointers to even earlier alignment or memory-based models that influenced this direction.
