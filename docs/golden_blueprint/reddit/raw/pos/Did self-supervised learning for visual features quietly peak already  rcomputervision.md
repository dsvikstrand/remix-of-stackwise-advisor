From around 2020–2024 it felt like self-supervised learning (SSL, self-supervised learning) for image features was on fire — BYOL (Bootstrap Your Own Latent), SimCLR (Simple Contrastive Learning of Representations), SwAV (Swapping Assignments between multiple Views), DINO, etc. Every few months there was some new objective, augmentation trick, or architectural tweak that actually moved the needle for feature extractors.

This year it feels a lot quieter on the “new SSL objective for vision backbones” front. We got DINOv3, but as far as I can tell it’s mostly smart but incremental tweaks plus a lot of scaling in terms of data and compute, rather than a totally new idea about how to learn general-purpose image features.

So I’m wondering:

-   Have I just missed some important recent SSL image models for feature extraction?
    
-   Or has the research focus mostly shifted to multimodal/foundation models and generative stuff, with “vanilla” visual SSL kind of considered a solved or mature problem now?
    

is the SSL scene for general vision features still evolving in interesting ways, or did we mostly hit diminishing returns after the original _DINO/BYOL/SimCLR_ wave?