# Google Research Presents Titans + MIRAS: A Path Toward Continuously Learning AI | "We introduce the Titans architecture and the MIRAS framework, which allow AI models to work much faster and handle massive contexts by updating their core memory while it's actively running."

[

R

](chrome-extension://kcbaglhfgbkjdnpeokaamjjkddempipm/r/mlscaling/?f=flair_name%3A%22R%22)

 ![](https://preview.redd.it/google-research-presents-titans-miras-a-path-toward-v0-d90wz8ocrf5g1.png?width=640&crop=smart&auto=webp&s=41b4b56da814a929d5085ae508c70b5b73604cad) ![r/mlscaling - Google Research Presents Titans + MIRAS: A Path Toward Continuously Learning AI | "We introduce the Titans architecture and the MIRAS framework, which allow AI models to work much faster and handle massive contexts by updating their core memory while it's actively running."](https://preview.redd.it/google-research-presents-titans-miras-a-path-toward-v0-d90wz8ocrf5g1.png?width=640&crop=smart&auto=webp&s=41b4b56da814a929d5085ae508c70b5b73604cad)

function recordImagePerformanceMark() { performance.mark('first-post-meaningful-paint'); } document && document .getElementById('post-image') .addEventListener('load', recordImagePerformanceMark);

#### Summary:

In two new newly formalized papers, Titans and MIRAS, we introduce an architecture and theoretical blueprint that combine the speed of RNNs with the accuracy of transformers. Titans is the specific architecture (the tool), and MIRAS is the theoretical framework (the blueprint) for generalizing these approaches. Together, they advance the concept of test-time memorization, the ability of an AI model to maintain long-term memory by incorporating more powerful “surprise” metrics (i.e., unexpected pieces of information) while the model is running and without dedicated offline retraining.

The MIRAS framework, as demonstrated by Titans, introduces a meaningful shift toward real-time adaptation. Instead of compressing information into a static state, this architecture actively learns and updates its own parameters as data streams in. This crucial mechanism enables the model to incorporate new, specific details into its core knowledge instantly.

**TL;DR:**

-   Titans Architecture = Learning new context on the fly
    
-   MIRAS Framework = A unified view of sequence modeling
    
    -   Sequence Modeling = Necessary for tasks where the timeline or arrangement of data dictates meaning, such as predicting the next word in a sentence, forecasting stock prices based on past performance, or interpreting audio for speech recognition.
        

___

#### Explanation of the Titans Archiecture:

Crucially, Titans doesn’t just passively store data. It actively learns how to recognize and retain important relationships and conceptual themes that connect tokens across the entire input. **A key aspect of this ability is what we call the “surprise metric”.**

In human psychology, we know we quickly and easily forget routine, expected events but remember things that break the pattern — unexpected, surprising, or highly emotional events.

[https://i.imgur.com/C4YVTtV.png](https://i.imgur.com/C4YVTtV.png)

In the context of Titans, the "surprise metric" is the model detecting a large difference between what it currently remembers and what the new input is telling it.

-   **Low surprise:** If the new word is "cat" and the model's memory state already expects an animal word, the gradient (surprise) is low. It can safely skip memorizing the word "cat" in its permanent long-term state.
    
-   **High surprise:** If the model's memory state is summarizing a serious financial report, and the new input is a picture of a banana peel (the unexpected event), the gradient (surprise) will be very high.
    
    -   This signals that the new input is important or anomalous, and it must be prioritized for permanent storage in the long-term memory module.
        

**The model uses this internal error signal (the gradient) as a mathematical equivalent of saying, "This is unexpected and important!"** This allows the Titans architecture to selectively update its long-term memory only with the most novel and context-breaking information, keeping the overall process fast and efficient.

Titans refines this mechanism by incorporating two critical elements:

-   **Momentum:** The model considers both "momentary surprise" (the current input) and "past surprise" (the recent context flow). This ensures relevant subsequent information is also captured, even if those tokens are not individually surprising.
    
-   **Forgetting:** To manage the finite capacity of the memory when dealing with extremely long sequences, Titans employ an adaptive weight decay mechanism.
    
    -   This acts as a forgetting gate, allowing the model to discard information that is no longer needed.
        

___

#### Explanation of the MIRAS Framework:

[https://i.imgur.com/y6H2AWp.jpeg](https://i.imgur.com/y6H2AWp.jpeg)

What makes MIRAS both unique and practical is the way it views AI modeling. **Instead of seeing diverse architectures, it sees different methods of solving the same problem: efficiently combining new information with old memories without letting the essential concepts be forgotten.**

MIRAS defines a sequence model through four key design choices:

-   **Memory architecture:** The structure that stores information (e.g., a vector, matrix, or a deep multi-layer perceptron, like in Titans).
    
-   **Attentional bias:** The internal learning objective the model optimizes that determines what it prioritizes.
    
-   **Retention gate:** The memory regularizer. MIRAS reinterprets "forgetting mechanisms" as specific forms of regularization that balance new learning against retaining past knowledge.
    

**Memory algorithm:** The optimization algorithm used to update the memory.

___

#### Benchmark On Extreme Long Context Recall

The most significant advantage of these new architectures is their ability to handle extremely long contexts. This is highlighted in the BABILong benchmark (the picture attached to this post), a task requiring reasoning across facts distributed in extremely long documents.

In this challenging setting, Titans outperforms all baselines, including extremely large models like GPT-4, despite having many fewer parameters. Titans further demonstrates the capability to scale effectively to context window sizes larger than 2 million tokens.

___

#### Conclusion:

**The introduction of Titans and the MIRAS framework marks a significant advancement in sequence modeling.** By employing deep neural networks as memory modules that learn to memorize as data is coming in, these approaches overcome the limitations of fixed-size recurrent states. Furthermore, MIRAS provides a powerful theoretical unification, revealing the connection between online optimization, associative memory, and architectural design.

**By moving beyond the standard Euclidean paradigm, this research opens the door to a new generation of sequence models that combine the efficiency of RNNs with the expressive power needed for the era of long-context AI.**

___

##### Link to the Official Google Research Announcement: [https://research.google/blog/titans-miras-helping-ai-have-long-term-memory/](https://research.google/blog/titans-miras-helping-ai-have-long-term-memory/)

___

##### Link a Layman's Explanation of the Findings: [https://the-decoder.com/google-outlines-miras-and-titans-a-possible-path-toward-continuously-learning-ai](https://the-decoder.com/google-outlines-miras-and-titans-a-possible-path-toward-continuously-learning-ai)

___

##### Link to the Titans Paper: [https://arxiv.org/abs/2501.00663](https://arxiv.org/abs/2501.00663)

___

##### Link to the MIRAS Paper: [https://arxiv.org/pdf/2504.13173](https://arxiv.org/pdf/2504.13173)

Share