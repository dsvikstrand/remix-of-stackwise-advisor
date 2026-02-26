People talk about “RAG” like it’s a single architecture.
In practice, most serious RAG systems behave like three separate pipelines that just happen to touch each other.
A lot of problems come from treating them as one blob.

## 1\. The Ingestion Pipeline the real foundation

This is the part nobody sees but everything depends on:

-   document parsing

-   HTML cleanup

-   table extraction

-   OCR for images

-   metadata tagging

-   chunking strategy

-   enrichment / rewriting

If this layer is weak, the rest of the stack is in trouble before retrieval even starts.
Plenty of “RAG failures” actually begin here, long before anyone argues about embeddings or models.

## 2\. The Retrieval Pipeline the part everyone argues about

This is where most of the noise happens:

-   vector search

-   sparse search

-   hybrid search

-   parent–child setups

-   rerankers

-   top‑k tuning

-   metadata filters

But retrieval can only work with whatever ingestion produced.
Bad chunks + fancy embeddings = still bad retrieval.

And depending on your data, you rarely have _one_ retriever you’re quietly running several:

-   semantic vector search

-   keyword / BM25 signals

-   SQL queries for structured fields

-   graph traversal for relationships

All of that together is what people casually call “the retriever.”

## 3\. The Generation Pipeline the messy illusion of simplicity

People often assume the LLM part is straightforward.
It usually isn’t.

There’s a whole subsystem here:

-   prompt structure

-   context ordering

-   citation mapping

-   answer validation

-   hallucination checks

-   memory / tool routing

-   post‑processing passes

At any real scale, the generation stage behaves like its own pipeline.
Output quality depends heavily on how context is composed and constrained, not just which model you pick.

## The punchline

A lot of RAG confusion comes from treating ingestion, retrieval, and generation as one linear system
when they’re actually three relatively independent pipelines pretending to be one.

Break one, and the whole thing wobbles.
Get all three right, and even “simple” embeddings can beat flashier demos.

**how you guys see it which of the three pipelines has been your biggest headache?**
