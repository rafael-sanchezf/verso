# Can a language model build a Pandora-style attribute genome for games and movies?

Research notes, 2026-10-29. Scope: reliability of LLM graded annotation, grounding and long-tail knowledge, measured value of LLM item attributes in recommenders, scored attributes versus embeddings, rubric design, cost, and IGDB/TMDB data terms. Context: Verso catalog of 69,183 games (IGDB mirror), about 25,000 films and 12,000 series (TMDB mirror). Every finding carries its source and date. "Secondary" marks a figure seen only in a summary page, not in the paper itself. Nothing here is legal advice.

## Reliability: how well LLM graded annotations agree with expert and crowd annotators

### Takeaway
On categorical labels with a ground truth, LLMs matched or beat crowd workers from 2023 on, with far higher self-consistency. On graded (0 to 5 style) judgments the picture is task-dependent: pooled human-LLM agreement can reach ICC about 0.85 on a 0-5 scale, but per-task agreement ranges from about 0.5 to 0.9, models compress intensity, anchor later attributes on earlier ones in the same output, and move with prompt format. Every attribute needs its own validation against human labels.

### Cited Findings
- Gilardi, Alizadeh and Kubli (PNAS, July 2023): 6,183 tweets and news articles, four tasks (relevance, stance, topic, frame); zero-shot ChatGPT beat MTurk crowd workers by about 25 accuracy points on average; intercoder agreement about 56% MTurk, 79% trained annotators, 91% ChatGPT at temperature 1, 97% at temperature 0.2; under $0.003 per annotation, about 30 times cheaper than MTurk; lower temperature raised consistency without lowering accuracy — [arXiv 2303.15056](https://arxiv.org/abs/2303.15056) (published version PNAS vol. 120 no. 30)
- Törnberg (arXiv preprint, April 2023): GPT-4 zero-shot beat expert coders and crowd workers at inferring US politicians' party from tweets, with "higher reliability, and equal or lower bias"; one dataset, one task, not peer reviewed as far as the search showed — [arXiv 2304.06588](https://arxiv.org/abs/2304.06588)
- Pangakis, Wolken and Fasching (arXiv, May 2023): GPT-4 redid 27 annotation tasks from 11 social-science datasets; performance "promising" but highly dependent on dataset and task, so validation must be done per task; nine of 27 tasks had precision or recall below 0.5 (figure read from the ar5iv rendering, not the PDF) — [arXiv 2306.00176](https://arxiv.org/abs/2306.00176); [ar5iv](https://ar5iv.labs.arxiv.org/html/2306.00176)
- Bojic and others (arXiv, January 2025): 33 human annotators vs eight LLM variants (GPT-4 variants, Gemini, Llama, Mixtral) on 100 texts; Krippendorff's alpha for reliability, ICC for stability over three time points. Sentiment and political leaning: both reliable, LLMs more internally consistent. Emotional intensity (the most "graded" task): LLMs agreed with each other more than humans did, but humans rated intensity significantly higher than LLMs. Sarcasm: low agreement for both. LLM outputs highly stable over time. Exact alpha/ICC values not read (abstract only) — [arXiv 2501.02532](https://arxiv.org/abs/2501.02532)
- Li and others (Harvard, CMU, Stanford, UCSD; arXiv, 6 January 2026), "Human-LLM Alignment Is Highest on 0-5 Grading Scale": 6 LLM judges, 6 benchmarks, 12 human raters on 150 items. Pooled human-LLM ICC 0.853 on 0-5, 0.805 on 0-10, 0.840 on 0-100. Per benchmark on 0-5 the ICC ranged from 0.905 (STS-B) and 0.891 (MoralChoice) down to 0.582 (SummEval), 0.565 (TruthfulQA), 0.517 (MT-Bench). Per model on 0-5: GPT-4o 0.816, Gemini 2.5 Flash 0.782, Llama 3.3 70B 0.744, Qwen3-32B 0.731, DeepSeek 0.696, Mistral-7B 0.596. Temperature 0.1 to 1.0 changed ICC little; scale choice mattered more than sampling randomness. Did not report central tendency or heaping — [arXiv 2601.03444](https://arxiv.org/html/2601.03444v1)
- Stureborg, Alikaniotis and Suhara (arXiv, May 2024), "Large Language Models are Inconsistent and Biased Evaluators" (GPT-3.5 and GPT-4 on SummEval and RoSE): familiarity bias toward low-perplexity text; anchoring, where scores for later attributes in one output are pulled toward earlier ones; round-number bias (some scores assigned far more often); low inter-sample agreement; sensitivity to prompt differences insignificant to humans — [arXiv 2405.01724](https://arxiv.org/abs/2405.01724)
- Sclar, Choi, Tsvetkov and Suhr (ICLR 2024): formatting-only prompt changes moved few-shot accuracy by up to 76 points on LLaMA-2-13B; not removed by more examples, larger models or instruction tuning; format effects correlate only weakly across models; authors recommend reporting a range across plausible formats — [arXiv 2310.11324](https://arxiv.org/abs/2310.11324v2)
- Long, Wang and others (Google/YouTube; ACM RecSys 2025): Gemini 2.5 Pro labelled a "nuanced content attribute" (vibes such as authentic, calming, energetic) on short videos at F1 81.33% (precision 85.03%, recall 77.94%) vs external crowd raters at F1 63.21% (precision 76.82%, recall 53.69%), measured against an expert "Golden Set" — [arXiv 2510.06657](https://arxiv.org/html/2510.06657v1)
- A search snippet attributes "heaped" LLM score distributions (outputs piling on a few values of an ordinal scale) to an EMNLP 2025 paper; not opened, so unverified — [arXiv 2509.03116](https://www.arxiv.org/pdf/2509.03116)
- Penha and others (Spotify; arXiv, November 2025): a GPT-5 judge of movie relevance on ML-32M-ext (31,236 human judgments, 51 participants) reached Kendall's tau 0.87 with human-based system rankings at 100 predictions per user, but item-level pairwise agreement with humans was only about 0.55 to 0.57 — [arXiv 2511.23312](https://arxiv.org/html/2511.23312v1)

### Inferences
- A genome's aesthetic attributes ("how melancholy, 0 to 5") have no ground truth, so the measurable target is agreement with Rafa's or expert human scores, plus agreement of the model with itself across prompts and models. The 2026 ICC range (0.52 to 0.91 by task) says some attributes will clear the bar and some will not; expect that, and drop the ones that fail.
- Stureborg's anchoring result bears directly on scoring 30 or 40 attributes in a single JSON response: later attributes may drift toward earlier ones. Randomizing attribute order across two runs, or scoring attribute groups in separate calls, would expose and reduce it.
- Bojic's intensity result (LLMs rate intensity lower than humans) is a warning for central tendency on graded scales: expect compressed scores, so per-attribute rescaling against human anchors (or a calibration layer like LLM-Rubric, below) may be needed.
- System-level agreement can be high while item-level agreement is modest (Spotify: tau 0.87 vs pairwise about 0.55). A genome that works for ranking lists of recommendations may still mislabel individual items, which matters for item-level explanations.

### Gaps
- No study found that scores films or games on graded aesthetic attributes with an LLM and reports Krippendorff's alpha against expert raters. The closest are the YouTube vibes paper (binary-ish attribute, F1) and generic LLM-judge studies.
- Exact Krippendorff's alpha values in Bojic 2025 were not read; the heaping paper (2509.03116) was not opened.
- No 2025-2026 study found on run-to-run variance specifically for multi-attribute item profiles.

## Knowledge and grounding: popular versus long-tail titles, and abstention

### Takeaway
Model knowledge of items falls with popularity, and small models know far fewer catalog items than large ones (GPT-4o recalled 81% of MovieLens-1M titles, GPT-4o mini 8%). Retrieval or grounding text largely fixes long-tail factual recall in QA. For movies, adding metadata to an LLM judge raised agreement with humans modestly, while an average-rating field lowered it. Models carry an internal "do I know this entity" signal, but with a closed API the practical abstention tools are popularity thresholds, grounding-length checks, and fact checks against the catalog record.

### Cited Findings
- Head-to-Tail (Sun and others, Meta; NAACL 2024, arXiv August 2023): 18K QA pairs bucketed head/torso/tail by popularity; accuracy of GPT-4 and Llama 2-70B falls head > torso > tail; GPT-4 only about 48% even on head entities in the open domain; separates accuracy, hallucination and "missing" (answered unsure) rates; instruction tuning raised the missing rate without necessarily improving accuracy (secondary) — [arXiv 2308.10168](https://arxiv.org/abs/2308.10168)
- Mallen and others, "When Not to Trust Language Models" (ACL 2023): PopQA, 14k questions, popularity = Wikipedia page views; on the 4,000 least popular questions GPT-3 davinci-003 got 19%; non-parametric retrieval largely improves the long tail; adaptive retrieval (retrieve only below a per-relation popularity threshold) improved PopQA by up to 10% and cut GPT-3 API cost by half — [arXiv 2212.10511](https://arxiv.org/abs/2212.10511)
- Di Palma and others (SIGIR 2025, arXiv May 2025), "Do LLMs Memorize Recommendation Datasets?": share of MovieLens-1M's 3,883 items recoverable by prompting: GPT-4o 80.76%, GPT-3.5 turbo 60.47%, Llama-3.1 405B 15.09%, GPT-4o mini 8.47%, Llama-3.1 70B 8.01%, Llama-3.1 8B 3.71%. By popularity (most / middle / least popular): GPT-4o 89.06% / 86.68% / 63.97%; GPT-4o mini 13.48% / 9.49% / 2.29%; Llama-3.1 405B 19.79% / 18.00% / 6.34%. Within a model family, more memorization went with better recommendation scores — [arXiv 2505.10212](https://arxiv.org/html/2505.10212v1)
- Penha and others (Spotify, November 2025): LLM movie-relevance judge pairwise agreement with humans: title only 0.5479; title + languages 0.5726 (best); title + cast 0.5649; title + all metadata 0.5599 (lowest disagreement, 0.1790); title + average rating 0.5398, below baseline. "All metadata fields except average rating" helped — [arXiv 2511.23312](https://arxiv.org/html/2511.23312v1)
- Ferrando, Obeso, Rajamanoharan and Nanda (ICLR 2025, arXiv November 2024): sparse autoencoders on Gemma 2 find entity-recognition directions that fire for entities the model can or cannot recall facts about, including an obscure movie; steering them makes the model hallucinate on unknown entities or refuse on known ones — [arXiv 2411.14257](https://arxiv.org/html/2411.14257v2)
- Spotify audiobooks (arXiv April 2025): because audiobooks lack rich metadata, an LLM extracts descriptors "grounded on the item's metadata" (title, authors, description, BISAC genres), 10 descriptor types per audiobook (from search snippet) — [arXiv 2504.13572](https://arxiv.org/html/2504.13572v1)
- Long, Wang and others (Google, RecSys 2025): a prompt for "authentic" wrongly excluded heavily edited vlogs until the instruction was rewritten, an example of definitions, not knowledge, driving errors — [arXiv 2510.06657](https://arxiv.org/html/2510.06657v1)

### Inferences
- Haiku-class models will know far fewer of the 69,183 games than a large model does; Di Palma's 10x gap between GPT-4o and GPT-4o mini on a famous movie dataset suggests parametric knowledge of a small model is thin even for films. For Haiku, the grounding text (IGDB summary and storyline, genres, themes, keywords; TMDB overview and keywords) is the evidence, not a supplement.
- A practical abstention design, following Mallen's adaptive-retrieval idea: (1) gate on a popularity signal already in the mirrors (IGDB rating or follow counts, TMDB vote count); (2) gate on grounding length (no summary, no score); (3) ask the model first for two or three checkable facts (developer, release year, platform) and compare with the catalog record, abstaining on mismatch; (4) give every attribute an explicit "cannot tell from the text" value instead of forcing a number; (5) flag items where two runs disagree by more than one scale point.
- Penha's result that average rating lowered agreement argues for keeping popularity and rating fields out of the scoring prompt, so scores describe the item, not its reception.

### Gaps
- No benchmark found that measures LLM factual knowledge of video games by popularity (the closest game papers test playing games, not knowing them). The games long tail is likely worse than films, but this is not measured.
- No study found that measures how grounding text changes accuracy of graded aesthetic attributes (as opposed to factual QA or relevance).
- No current (2026) figures for Claude Haiku-class item knowledge; all memorization numbers are for GPT and Llama models.

## Measured value in recommenders: LLM-generated item attributes or profiles

### Takeaway
Adding LLM-generated item attributes or profiles to a recommender has produced offline gains of roughly 5 to 20% on standard metrics and small but real online lifts in production (Huawei +7% news and +1.7% music per a summary; YouTube +0.21% satisfied consumption from one attribute). Gains come mostly when the generated features feed a learned model; free-form tags underperform structured ones, and filtering is part of every production pipeline.

### Cited Findings
- LLMRec (Wei and others, HKU and Baidu; WSDM 2024 oral, arXiv November 2023): gpt-3.5-turbo generated item attributes (director, country, language) and user profiles (age, gender, liked/disliked genre, directors, country, language) for Netflix (17,366 items) and MovieLens (10,322 items). Netflix Recall@20 0.0829 vs best baseline MICRO 0.0764 (+8.51%), NDCG@20 +20.91%. Ablations: no user profiling 0.0656; no user or item side-information augmentation 0.0602. No item-attribute-only ablation. Total LLM augmentation cost about $21 — [arXiv 2311.00423v6](https://arxiv.org/html/2311.00423v6)
- KAR (Xi and others, Huawei Noah's Ark; arXiv June 2023, later ACM RecSys 2024): "factorization prompting" separates user-preference reasoning from item factual knowledge; a hybrid-expert adaptor turns the text into vectors for any recommender; online A/B gains of 7% (news) and 1.7% (music) reported in a summary, not read in the paper — [arXiv 2306.10933](https://arxiv.org/abs/2306.10933); [Emergent Mind summary](https://emergentmind.com/papers/2306.10933)
- Jia, Yuan, Wu and Zheng (UC Berkeley and Tsinghua; arXiv April 2025): an LLM (Llama 3.2 1B with LoRA) scores items and users on 12 predefined attributes per domain on a 1-10 scale (games: difficulty level, replay value, graphics quality, customization; movies: story complexity, dialogue complexity, intellectual challenge, emotional intensity), concatenated with base embeddings of GRU4Rec, SASRec, BERT4Rec on Amazon Reviews 2023. MRR gains: movies +6.6% to +14.1%; video games +14.4% to +19.7%; Recall@1 up to +48.97% (games). No reliability checks on the scores and no comparison against plain LLM text embeddings — [arXiv 2504.11658](https://arxiv.org/html/2504.11658v1)
- Long, Wang and others (Google/YouTube, RecSys 2025): Gemini labels used as teacher labels, distilled into small DNNs; direct LLM annotation about 10^5 to 10^6 videos per day, distillation about 10^7 per day; one nuanced attribute used in retrieval gave +0.21% satisfied consumption and +0.49% participation in content creation in online A/B; prompt-to-A/B time "within one week" — [arXiv 2510.06657](https://arxiv.org/html/2510.06657v1)
- Spotify Engineering (Puleo, Seetharam, Drzyzga, 21 October 2024): an LLM-based annotation system "runs in parallel to the human experts"; ambiguous items escalate to quality analysts; the pilot grew the annotation corpus 10 times with three times the annotator productivity; no quality-validation method for the LLM output described — [Spotify Engineering](https://engineering.atspotify.com/2024/10/how-we-generated-millions-of-content-annotations/)
- Amazon COSMO (Yu and others, SIGMOD 2024 Companion): an LLM generates commonsense hypotheses from query-purchase and co-purchase behavior; human annotation plus ML classifiers filter low-quality output; a fine-tuned COSMO-LM extends it to 18 major categories. A secondary summary says only 35% of initial search-buy explanations met the typicality bar; Amazon Science's blog reports up to 60% macro-F1 gains on a downstream task (not opened; not a production lift) — [Amazon Science publication](https://www.amazon.science/publications/cosmo-a-large-scale-e-commerce-common-sense-knowledge-generation-and-serving-system-at-amazon); [Amazon Science blog](https://www.amazon.science/blog/building-commonsense-knowledge-graphs-to-aid-product-recommendation)
- Xiaohongshu-style note tagging (arXiv March 2026, from search summary): LLM-generated tags are often coarse and redundant, which hurts downstream recommendation — [arXiv 2603.21481](https://arxiv.org/html/2603.21481)
- AgenticTagger (arXiv February 2026, from a review summary): free-form LLM features performed poorly for generative recommendation because of high cardinality and no structure; structured descriptors did better — [arXiv 2602.05945](https://arxiv.org/pdf/2602.05945)
- MovieLens Tag Genome (GroupLens): each movie gets a relevance score between 0 and 1 on 1,128 tags (2014) or 1,084 tags for 9,734 movies (2021 release, which includes inputs to regenerate it with the original Vig and others 2012 method and the Kotkov and others 2021 TagDL method) — [GroupLens Tag Genome 2021](https://grouplens.org/datasets/movielens/tag-genome-2021/); the original unbiased relevance ground truth was not released, per the DOCENT paper — [arXiv 2102.13247](https://arxiv.org/pdf/2102.13247)

### Inferences
- The published lifts all come from feeding attributes into a learned recommender with plenty of interaction data. Verso's beta recommender picks from a user's own list in SQL with a model-written reason, so the closer analogue is the explanation and cold-start use, where no paper above measures value directly.
- The MovieLens Tag Genome overlaps Verso's film catalog and has tags such as atmosphere and pace; it could serve as a free external check on an LLM-built film genome (correlate LLM scores with genome relevance on matching tags) before any games work.
- Every production pipeline found (Amazon, Spotify, YouTube) keeps humans in a filter or golden-set role; none runs an unvalidated LLM straight into the catalog.

### Gaps
- No Netflix or Pinterest engineering post on model-generated item attributes was found in this pass.
- No paper found that isolates the value of LLM item attributes alone (LLMRec ablates user and item together).
- No study on games catalogs beyond Jia 2025's Amazon Video Games reviews.

## Explicit scored attributes versus text embeddings

### Takeaway
No head-to-head study under identical conditions was found. The evidence says attributes are interpretable and editable with roughly parity accuracy (natural-language profiles), and that attribute scores add to, rather than replace, learned embeddings (Jia 2025). Combining both is the pattern in the literature.

### Cited Findings
- Radlinski and others (SIGIR 2022, cited via Ramos 2024): embeddings are complex continuous vectors that cannot be easily interpreted or modified; proposes natural-language profiles instead — [ACL Anthology, Ramos and others 2024](https://aclanthology.org/2024.acl-long.753.pdf)
- Ramos, Rahmani, Wang, Fu and Lipani (ACL 2024): LLM-generated natural-language user profiles drive a recommender that is "competitive" with popular baselines while transparent and editable; parity, not improvement; tested on Amazon Movies and TV and TripAdvisor — [arXiv 2402.05810](https://arxiv.org/html/2402.05810v2)
- Jia and others (April 2025): 12 LLM-scored attributes concatenated with learned sequence-model embeddings improved MRR 6.6% to 19.7%; case studies show why a user likes or dislikes an item; no attributes-only or text-embedding comparison — [arXiv 2504.11658](https://arxiv.org/html/2504.11658v1)
- End-to-end training with language-based user profiles (arXiv October 2024, from search summary): text profiles held up better than a zero-shot embedding baseline as training data shrank — [arXiv 2410.18870](https://arxiv.org/pdf/2410.18870)
- LGRID (arXiv July 2026): argues LLM item embeddings are opaque because dimensions have no attribute meaning; builds attribute-aligned slots and quantizes them into semantic IDs — [arXiv 2607.27944](https://arxiv.org/pdf/2607.27944)
- TEARS (arXiv October 2024): pairs black-box embeddings with text-summary embeddings for scrutable recommendation — [arXiv 2410.19302](https://arxiv.org/html/2410.19302v2)

### Inferences
- Per-user weights: with 30 to 40 scored attributes, a per-user linear model over attributes (for example fitted to the user's head-to-head comparison events) has few parameters and can learn from tens of comparisons; a 768- to 1,536-dimension embedding needs far more data per user or a shared projection. This is reasoning, not a measured result.
- Explanations: scored attributes support sentences like "both are slow, melancholy, exploration-heavy" directly from numbers; embeddings need a second step (nearest attribute words or a model) to produce any sentence.
- The cheap combined path: keep a text embedding for retrieval, and use the scored attributes for explanation, filtering ("short and relaxing tonight") and per-user weights.

### Gaps
- No paper compares explicit LLM-scored attributes against embeddings of the same grounding text, on the same data, for accuracy.
- No study measures per-user weight learning on LLM attributes from pairwise comparisons.

## Rubric design: number of attributes, scale, anchors, double scoring, versioning

### Takeaway
What transfers from Pandora and from LLM-judge research: a fixed vocabulary of attributes with written definitions, a 0-5 scale with a described meaning for every point, reference items as anchors, a human golden set to validate each attribute, double scoring on a sample, and calibration against human scores. Free-form tags and holistic scores do worse than structured, defined attributes.

### Cited Findings
- Pandora's Music Genome Project: about 450 genes in total; rock and pop 150, rap 350, jazz about 400, world and classical 300 to 450; each gene scored 0 to 5 in half-integer steps (per US patent 7,003,515); 20 to 30 minutes per song (Tiny Mix Tapes interview with Tim Westergren, February 2006); about 10% of songs analyzed by more than one musician to check conformity and statistical reliability — [Wikipedia, Music Genome Project](https://en.wikipedia.org/wiki/Music_Genome_Project)
- Li and others (January 2026): 0-5 gave the highest pooled human-LLM ICC (0.853) vs 0-10 (0.805) and 0-100 (0.840); 1-5 not tested; MT-Bench was the exception (best on 0-10) — [arXiv 2601.03444](https://arxiv.org/html/2601.03444v1)
- Prometheus (Kim and others, ICLR 2024): an evaluator given a custom score rubric with a description per score plus a reference answer for score 5 reached Pearson 0.897 with human evaluators across 45 rubrics, on par with GPT-4 (0.882) and far above ChatGPT (0.392); human-level only "when appropriate reference materials" are provided — [arXiv 2310.08491](https://arxiv.org/abs/2310.08491)
- LLM-Rubric (Hashemi, Eisner, Rosset, Van Durme, Kedzie; ACL 2024): the LLM answers each rubric question as a probability distribution, and a small network calibrated on human judges maps those to each judge's ratings; RMS error under 0.5 on a 4-point scale, about half the uncalibrated baseline — [ACL Anthology 2024.acl-long.745](https://aclanthology.org/2024.acl-long.745)
- Google/YouTube (RecSys 2025): explicit, unambiguous attribute definitions; a "Golden Set" labelled by expert raters who aligned through discussion and calibration; edge cases drove prompt revisions; refinement continued through A/B feedback — [arXiv 2510.06657](https://arxiv.org/html/2510.06657v1)
- Stureborg and others (2024): anchoring across attributes scored in one output, round-number bias — [arXiv 2405.01724](https://arxiv.org/abs/2405.01724)
- Gilardi and others (2023): temperature 0.2 gave 97% self-agreement vs 91% at temperature 1, without an accuracy cost — [arXiv 2303.15056](https://arxiv.org/abs/2303.15056)
- Arize vendor guidance (undated docs page, not peer reviewed): validate a judge on 20 to 100 human-labelled examples spanning the score range; decomposed binary sub-criteria can be more reliable than one holistic score — [Arize docs](https://arize.com/docs/ax/concepts/evaluators/evaluator-best-practices)
- Jia and others (2025) used 12 attributes per domain on a 1-10 scale and got gains; the MovieLens Tag Genome uses 1,084 to 1,128 continuous 0-1 tags — [arXiv 2504.11658](https://arxiv.org/html/2504.11658v1); [GroupLens](https://grouplens.org/datasets/movielens/tag-genome-2021/)

### Inferences
- What a prompt can copy from Pandora: the fixed gene vocabulary with written definitions (the rubric), the half-point 0-5 scale (a 0-5 integer scale per Li 2026), the training material (anchor items with known scores per scale point, as Prometheus' reference answers do), and the 10% double analysis (score a 10% sample twice, with a second prompt wording or a second model, and track agreement per attribute). What it cannot copy: analysts heard the whole song; the model reads a summary, not the game.
- Rough rubric shape suggested by the sources: a few dozen attributes per medium, each with a one-line definition, a described meaning for 0, 1, 3 and 5, two or three anchor titles per end of the scale, and an explicit "cannot tell" option. Check independence on a scored sample (correlation matrix) and merge attributes that move together.
- Binary versus graded: binary sub-criteria are easier to agree on (vendor guidance, YouTube used a yes/no attribute); graded 0-5 is what Pandora and the LLM-judge evidence support for intensity-type attributes. A mix is defensible: binary for presence features (co-op, open world), 0-5 for intensity (pace, difficulty, melancholy).
- Versioning: store a rubric version, model id and prompt hash on every score row, so a rubric change can be re-run in one batch and compared with the previous version.

### Gaps
- No source found on versioning an LLM-built genome over time, or on drift when the model behind an alias changes.
- No study found that measures how many attributes a single call can score before anchoring or quality degrades.
- Pandora's analyst training content itself is not public beyond press accounts. Search snippets from older press pieces (about 2005-2009) gave 40 hours of training in one and "over 100 hours" in another; the two conflict and neither was opened, so no figure is reported here.

## Cost of scoring every item once

### Takeaway
On Haiku 5.5 the whole games catalog costs about $16 at standard prices and about $8 with the Batch API; films about $6 and $3. A larger model is 20 to 40 times more: Sonnet 5.5 about $318 standard / $159 batch for all games, Opus 5.5 about $636 / $318. Output tokens dominate cost on every model, so asking for rationales multiplies the bill more than a longer rubric does. Cost is not the constraint; validation time is.

### Cited Findings
- Anthropic pricing page (fetched 2026-10-29): Haiku 5.5 (prompts up to 100K tokens) $0.10 input, $0.50 output, $0.125 cache write (5 minute), $0.01 cache read per million tokens; Sonnet 5.5 $2 / $10, cache read $0.10; Opus 5.5 $4 / $20, cache read $0.20. Haiku 4.5 (legacy) $1 / $5. The repo's 2026-10-08 Haiku 5.5 figure ($0.10 / $0.50) matches the live page — [claude.com/pricing](https://claude.com/pricing)
- Batch processing docs (fetched 2026-10-29): "All usage is charged at 50 percent of the standard API prices"; Haiku 5.5 batch $0.05 / $0.25, Sonnet 5.5 $1 / $5, Opus 5.5 $2 / $10; up to 100,000 requests or 256 MB per batch; most batches finish within 1 hour, expire after 24 hours; caching and batch discounts "can stack", but cache hits in batches are best-effort, typically 30% to 98% — [Batch processing docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- Prompt caching docs (fetched 2026-10-29): minimum cacheable prompt is 512 tokens for Haiku 5.5, Sonnet 5.5 and Opus 5.5 (4,096 for Haiku 4.5); cache reads are 0.1x base input on Haiku 5.5 and 0.05x on Sonnet 5.5 and Opus 5.5; 1-hour cache writes cost 2x base input — [Prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Gilardi 2023 benchmark for comparison: ChatGPT annotation under $0.003 per annotation — [arXiv 2303.15056](https://arxiv.org/abs/2303.15056)
- Pandora human benchmark: 20 to 30 minutes of analyst time per song — [Wikipedia, Music Genome Project](https://en.wikipedia.org/wiki/Music_Genome_Project)

Computed totals (USD, standard / batch). Scenario A is the brief's assumption: 800 input tokens billed as uncached input, 300 output tokens per item.

| Model | 69,183 games | 25,000 films | 12,000 series | 10,000 popular games |
|---|---|---|---|---|
| Haiku 5.5 | $15.91 / $7.96 | $5.75 / $2.88 | $2.76 / $1.38 | $2.30 / $1.15 |
| Sonnet 5.5 | $318.24 / $159.12 | $115.00 / $57.50 | $55.20 / $27.60 | $46.00 / $23.00 |
| Opus 5.5 | $636.48 / $318.24 | $230.00 / $115.00 | $110.40 / $55.20 | $92.00 / $46.00 |

Per item, Haiku 5.5 costs $0.00023 standard (input $0.00008, output $0.00015).

- Scenario B, a realistic rubric with anchors (4,000 tokens, cached and read at cache price) plus 600 tokens of grounding and 300 output: Haiku 5.5 games $17.30 / $8.65, films $6.25 / $3.12, popular games $2.50 / $1.25. Sonnet 5.5 and Opus 5.5 come out identical to Scenario A (the arithmetic happens to match).
- Scenario B with every cache read missing (batch hits are best-effort): Haiku 5.5 about $0.00061 per item, games about $42.20 standard / $21.10 batch, films about $15.25 / $7.63.
- Scenario C, as B but with a one-sentence rationale per attribute (1,500 output tokens): Haiku 5.5 games $58.81 / $29.40, films $21.25 / $10.62, popular games $8.50 / $4.25; Sonnet 5.5 games $1,148 / $574, films $415 / $207.50; Opus 5.5 games $2,297 / $1,148, films $830 / $415.
- Double scoring (two prompts or two models, for agreement) doubles any line. Scoring a 10% sample twice adds 10%.

### Inferences
- Human-analyst equivalent, using Pandora's 20 to 30 minutes per item (a song, so a floor for a game or film): 69,183 games is 23,000 to 34,600 hours; 25,000 films is 8,300 to 12,500 hours. The model run is minutes of wall-clock time and single-digit to low-hundreds of dollars.
- The 69,183 games fit in one batch by request count (under 100,000); whether they fit in 256 MB depends on prompt size (about 4.6K tokens each is roughly 18 KB, so about 1.3 GB, which means several batches). This is an estimate.
- The dominant real cost is the human golden set: scoring, say, 100 to 200 anchor items per medium by hand to validate each attribute.

### Gaps
- Token counts are assumptions; real grounding length from IGDB summaries and TMDB overviews was not measured (repo files were out of scope).
- Haiku 5.5's knowledge and scoring quality were not measured; no public benchmark found.

## Data terms: IGDB (Twitch) and TMDB

### Takeaway
TMDB's terms (last updated 20 October 2023) forbid using TMDB content in connection with an ML or AI application, forbid derivatives, cap caching at six months, and require a separate written agreement for commercial use; sending TMDB overviews to a model and storing derived scores looks prohibited without TMDB's written permission. IGDB's docs allow commercial use through a free partnership and encourage storing data locally, and say nothing about AI; but the Twitch Developer Services Agreement (last modified 12/04/2024) bars sharing "Twitch Data", which includes insights derived from it, with third parties without written permission, which plausibly reaches both sending text to a model provider and any sale of derived scores. Both need a written answer from the provider before building.

### Cited Findings
- TMDB API Terms of Use, "last updated on: October 20, 2023" — [TMDB API terms](https://www.themoviedb.org/api-terms-of-use):
  - Section 1.A: TMDB reserves the right to use its content "for training, a machine learning or artificial intelligence based Application" and reserves "the right to make derivatives of the TMDB APIs or TMDB Content".
  - Section 1.C (prohibited): using the APIs or content in connection with, "including for training, a machine learning (ML) or artificial intelligence (AI) based Application"; "Make derivatives of the TMDB APIs or TMDB Content"; "Cache, for longer than 6 months, any information obtained through or from TMDB".
  - Section 2.A: TMDB "does not permit any commercial use" without a separate written agreement; listed commercial uses include "Training or validating a machine learning or artificial intelligence system" and use in LLM-based "interactive query-response systems or chatbots".
  - Section 1.D: on termination, delete all TMDB content including cached content. Section 3: TMDB logo and a notice that the app "uses TMDB and the TMDB APIs but is not endorsed" by TMDB. Section 10.H: terms can change on posting.
- Twitch Developer Services Agreement, "Last modified on 12/04/2024" (text pulled with curl on 2026-10-29; WebFetch could not render it) — [Twitch Developer Services Agreement](https://legal.twitch.com/en/legal/developer-agreement/):
  - Section I: the Agreement includes "all terms, rules, and policies" Twitch makes available, so IGDB's own docs plausibly apply alongside it.
  - Section II: "Program Materials" include APIs, "data, metadata" made available under the Agreement.
  - Section VI.A: "Twitch Data" is data from the Twitch API or other Program Materials, "including any insights derived from that data".
  - Section VI.B: use limited to listed purposes, first "creating compelling benefits that improve the end user experience".
  - Section VI.C: Twitch Data and derived insights may not be sold, licensed, monetized, or "made available to, or otherwise shared with, any affiliates or third parties" without prior written permission.
  - Schedule 1.C: do not store Program Materials unless authorized, or "cache such information for only a twenty-four hour time period"; "Re-syndication and re-distribution of Program Materials" is prohibited.
  - Schedule 1.B: "Selling, licensing, or otherwise distributing any metadata" is prohibited absent a separate agreement.
  - No mention of artificial intelligence, machine learning, or IGDB anywhere in the text (searched).
- IGDB API docs (fetched 2026-10-29 with curl; WebFetch got 403) — [IGDB API docs](https://api-docs.igdb.com/):
  - "free for non-commercial usage under the terms of the Twitch Developer Service Agreement".
  - Commercial: "we allow commercial usage" via a partner program at partner@igdb.com; the partnership asks for visible user-facing attribution; "The API is free for both non-commercial and commercial projects".
  - Storage: "we prefer if you store and serve the data to your end users"; data may be kept after partnership termination.
  - Daily CSV data dumps are for data partners only. No mention of AI or machine learning.
- IGDB staff reply (2020-01-06) on the Twitch forum: whole API under "a single free tier", commercial use fine "currently", policy details to follow — [Twitch dev forum](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)

### Inferences
- TMDB: generating scores by sending TMDB overviews or keywords to Claude is "use in connection with" an AI-based application under 1.C, and the stored scores are plausibly "derivatives" of TMDB content; Verso's paid tier would also make it commercial use under 2.A. Without a written agreement, the film genome would have to be grounded on text from another source with compatible terms, or on the model's own knowledge with no TMDB text in the prompt (which brings back the long-tail problem). Even then, the 6-month cache cap and deletion-on-termination clauses apply to the TMDB data the scores are keyed on. A written question to TMDB is the cheapest way to settle it.
- IGDB: the IGDB-specific docs (store locally, commercial partnership, keep data after termination) are friendlier than the generic Twitch Schedule 1 (24-hour cache), and Section I suggests the IGDB rules apply to IGDB data. Schedule 1 itself covers "Twitch APIs" found at dev.twitch.tv; IGDB is documented at api-docs.igdb.com but authenticates with Twitch credentials, so whether Schedule 1 reaches IGDB is unclear. The body of the Agreement (Sections II and VI) applies either way if IGDB data counts as Program Materials, as the definition ("data, metadata") suggests. The open questions are whether sending IGDB summaries to Anthropic counts as making Twitch Data "available to" a third party under VI.C, and whether attribute scores are "insights derived" that cannot be shared. Showing scores to Verso's own users fits VI.B's end-user-benefit purpose; selling aggregate attribute data to studios (Verso decision 21's data products) would not without permission. One email to partner@igdb.com, asking for written permission for model processing and for storing and showing derived scores, closes it.
- Neither provider's terms address model-provider processing (sending text to an API that does not train on it) as distinct from training; the risk reading above assumes the broad wording governs.

### Gaps
- No written guidance from TMDB or IGDB on LLM inference (as opposed to training) was found.
- Anthropic's own API data-use terms (whether inputs are used for training) were not checked in this pass.
- Wikipedia or other plot-summary sources as alternative grounding for films, and their licence terms for derived scores, were not researched.
