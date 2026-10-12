# LLMs in a small recommender, and cross-domain taste transfer (state as of 2026-09-24)

Scope note: Part 1 covers the LLM's role (key questions 1 to 8). Part 2 covers cross-domain taste transfer (key questions 9 to 11). Prices were checked on the providers' pages on 2026-09-24. Token estimates come from a sample prompt built in the scratchpad (`costsim/`), counted at about 4 characters per token, the rule of thumb on Anthropic's pricing page.

## 1. LLM as reranker and explainer over retrieved candidates vs. LLM as zero-shot recommender over an open catalog (research 2022 to 2026)

### Takeaway
Across 2023 to 2026 papers the result holds: an off-the-shelf LLM does well when it reorders or explains a short list (about 20 items) that another system retrieved. It does poorly as a free-form recommender over a whole catalog, where it invents titles, favors popular items, and ignores collaborative signal. When candidates come from real retrieval models, a trained sequential model (SASRec) still beats a zero-shot LLM. So the LLM earns its cost mainly on choosing among close options, on diversity or niche exposure, and on explanation, not on raw accuracy.

### Cited Findings
**Surveys (framing)**
- Fan et al. (2023, IEEE TKDE 2024) sort LLM recommenders by pre-training, fine-tuning, and prompting paradigms. The LLM can serve as a feature encoder or as the recommender itself. — [arXiv 2307.02046](https://arxiv.org/abs/2307.02046)
- Wu et al. (2023, World Wide Web journal 2024) split the field into discriminative LLMs for recommendation (encoders) and generative ones. They name the main assets as "high-quality representations of textual features" and "extensive coverage of external knowledge." — [arXiv 2305.19860](https://arxiv.org/abs/2305.19860)
- Lin et al. (2023, ACM TOIS) ask "where" and "how" to adapt an LLM. The where: feature engineering, feature encoder, scoring or ranking function, user interaction, pipeline controller. The how: whether the LLM is tuned, and whether a conventional model stays in the loop at inference. — [arXiv 2306.05817](https://arxiv.org/abs/2306.05817)

**Foundational systems**
- P5 (Geng et al., RecSys 2022) casts all recommendation tasks as text-to-text for a fine-tuned T5-style model: "Recommendation as Language Processing." — [arXiv 2203.13366](https://arxiv.org/abs/2203.13366)
- TALLRec (Bao et al., RecSys 2023) LoRA-tunes LLaMA-7B on recommendation data. It "significantly enhance[s]" results in movies and books "even with a limited dataset of fewer than 100 samples," runs on one RTX 3090, and shows cross-domain generalization. — [arXiv 2305.00447](https://arxiv.org/abs/2305.00447)
- Kang et al. (2023) test LLMs from 250M to 540B parameters on rating prediction. Zero-shot LLMs "lag behind traditional recommender models that have the access to user interaction data." Fine-tuned LLMs match or beat them "with only a small fraction of the training data." — [arXiv 2305.06474](https://arxiv.org/abs/2305.06474)
- BIGRec (Bao et al., ACM TORS) finds that adding training samples yields only modest gains. The authors conclude LLMs have "limited capability to assimilate statistical information, such as popularity and collaborative filtering, due to their robust semantic priors." The implication is to keep those statistics outside the LLM. — [arXiv 2308.08434](https://arxiv.org/abs/2308.08434)

**Zero-shot ranking over a candidate list (the pattern Verso plans)**
- "LLMs are zero-shot rankers" (Hou et al., ECIR 2024) ranks m = 20 candidates: 1 ground truth plus 19 random negatives, on MovieLens-1M and Amazon Games. — [arXiv 2305.08845](https://arxiv.org/abs/2305.08845)
  - NDCG@10: GPT-4 scores 46.74 on ML-1M and 62.88 on Games. GPT-3.5 scores 48.80 and 50.31. The text-based zero-shot baseline UniSRec scores 26.67 and 40.71, and BM25 scores 17.88 and 34.61. Only 200 sampled users were evaluated.
  - In the realistic setting (21 candidates, the top 3 from each of 7 retrieval models, ground truth not guaranteed), the trained SASRec wins. NDCG@10 on ML-1M: SASRec 10.45, LLM 6.91. On Games: SASRec 4.02, LLM 2.80, BPRMF 2.96, Pop 2.27.
  - LLMs "struggle to perceive the order" of history. Shuffling the history left results about the same, while a fake history hurt.
  - Position bias: results drop "significantly when the ground-truth items appear at the last few positions." Ranking each candidate set 3 times with shuffled order and merging (bootstrapping) improves results.
  - Popularity bias: popular items land higher. The bias shrinks when the prompt carries fewer, more recent history items.
  - With a candidate list, GPT-3.5 still named out-of-candidate items "in a mere 3% of cases."
- Dai et al. (RecSys 2023) compare pointwise, pairwise, and listwise prompting on four datasets. ChatGPT "achieves an optimal balance between cost and performance when equipped with list-wise ranking." — [arXiv 2305.02182](https://arxiv.org/abs/2305.02182)
- Zero-Shot Next-Item Recommendation (NIR; Wang & Lim 2023): an external module generates candidates by user- or item-filtering, then a 3-step GPT-3 prompt runs: summarize preferences, pick representative watched movies, rank 10. On MovieLens-100K it outperformed "some strong sequential recommendation models." — [arXiv 2304.03153](https://arxiv.org/abs/2304.03153)
- "Beyond Utility" (Jiang et al., WWW 2025) evaluates 7 LLM recommenders against 6 traditional models. — [arXiv 2411.00331](https://arxiv.org/abs/2411.00331)
  - Two settings: ranking (1 positive plus 19 random negatives) and re-ranking (20 candidates from BPRMF, GRU4Rec, SASRec, LightGCN).
  - LLMs "generally underperform" traditional models when ranking random candidates. In re-ranking, "GPT-3.5 already shows higher re-ranking performance than four traditional models, both enhancing accuracy and promoting the exposure of niche items."
  - Off-the-shelf LLMs were "far less affected by popularity bias than traditional models." Note the tension with Hou et al.'s popularity finding; the difference is relative to which baseline.
  - Candidate position bias is "prevalent" in ranking. In re-ranking, LLMs are relatively insensitive, and ordering candidates by the recall model's rank can "leverage this position bias."
  - LLMs do best with "shorter input histories."
- Chat-REC (Gao et al., 2023) turns user profiles and history into prompts for a conversational, explainable recommender. It claims better top-k and zero-shot rating prediction, plus cross-domain transfer and handling of new items. — [arXiv 2303.14524](https://arxiv.org/abs/2303.14524)
- RecMind (Wang et al., NAACL 2024 Findings) is a tool-using LLM agent with "Self-Inspiring" planning. It "achieves comparable performance to a fully trained recommendation model P5." — [arXiv 2308.14296](https://arxiv.org/abs/2308.14296)
- LLM-Rec (Lyu et al., NAACL 2024 Findings) uses the LLM to enrich item text, not to rank. With the enriched text, "even basic MLP models achieve comparable or even better results than complex content-based methods." — [arXiv 2307.15780](https://arxiv.org/abs/2307.15780)
- Liu et al. (2023, "Is ChatGPT a good recommender?") ran five tasks on Amazon Beauty. ChatGPT reached "baseline level" on some tasks, and human raters preferred its explanations. — [arXiv 2304.10149](https://arxiv.org/abs/2304.10149)
- LLM4Rerank (Gao et al., WWW 2025) is a reranking framework that weighs accuracy, diversity, and fairness in one chain-of-thought and beats state-of-the-art rerankers on three datasets. — [arXiv 2406.12433](https://arxiv.org/abs/2406.12433)
- STELLA (Ma et al., 2023): "directly using LLMs as a recommender system is usually unstable due to its inherent position bias." The paper proposes probing and Bayesian calibration as a fix. — [arXiv 2312.15746](https://arxiv.org/abs/2312.15746)

**Open-catalog generation fails on hallucination (2026)**
- An August 2026 audit prompts Mistral Large, Llama-3.3-70B, GPT-OSS-120B, and Claude Sonnet 4.6 zero-shot with each user's 30 most recent items and asks for a top-10. — [arXiv 2608.10008](https://arxiv.org/abs/2608.10008)
  - Out-of-catalog rate (OOD@10): 0.6 to 2.7% on MovieLens-25M, 11.6 to 38.7% on Yelp, 49.3 to 61.0% on Amazon Toys. The rate tracks how well-known the catalog is.

### Inferences
- Verso's sketch (SQL candidates, then an LLM picks 3 and explains) sits where the evidence favors LLMs: re-ranking a short list of about 20 to 30. It avoids the open-catalog mode that fails badly.
- For accuracy alone, the LLM step probably will not beat a well-tuned SQL or collaborative score. Hou's realistic setting and BIGRec both point this way. Its value is choosing among near-ties, surfacing niche items, and writing the reason. Treat it as a "pick and explain" layer, not the ranker of record.
- Pass candidates in the retrieval score order, not shuffled. Beyond Utility shows this turns position bias into an advantage in re-ranking. Bootstrapping (3 shuffled calls) triples cost and is not worth it at this scale.
- Games are a favorable domain for LLM knowledge: Hou's Amazon Games NDCG was higher than ML-1M. Obscure indie titles resemble the "non-canonical catalog" case, where model knowledge is thin. Put the facts in the candidate lines rather than relying on the model's memory.

### Gaps
- No study found tests LLM reranking on a Beli-style pairwise-ranked list or on tiered 0 to 10 positional scores. All the evidence uses implicit feedback or 1 to 5 ratings.
- Most candidate-set evaluations use 1 positive plus 19 random negatives, which BIGRec argues overstates real ranking ability. Few papers report results with 30 retrieved candidates. LLM4CDR (Part 2) used 20, 25, and 30.

## 2. Industry practice: LLMs for reranking and natural-language explanations; cost and latency when given

### Takeaway
Large companies that rank with LLMs use small fine-tuned or custom models: Netflix GenRec at about 1B and 10B, Spotify with Llama 3.1 8B, LinkedIn MixLM. They constrain output to the catalog architecturally and report small ranking gains: Netflix +1.6% offline MRR and +0.006% online, LinkedIn +0.47% DAU. The large published effect is from explanations: Spotify saw up to 4x click-through on recommendations that carried one. Consumer products increasingly ship "one pick plus why." No company publishes per-request dollar costs. They report relative cost cuts from shorter context.

### Cited Findings
- **Netflix GenRec** (arXiv, 2026) is an LLM-backed ranker, either full-catalog or "top K ranking if candidate set is provided." — [arXiv 2608.10257](https://arxiv.org/abs/2608.10257); [search summary](https://www.emergentmind.com/papers/2608.10257)
  - Backbones of about 1B and about 10B parameters. Items are verbalized as "title name, release time, synopsis, etc."
  - A "catalog-aware scoring head … constrains recommendations to the Netflix in-catalog items, which eliminates out-of-catalog recommendations."
  - Gains: "+1.6% relative in MRR over the baseline" offline and "+0.006% relative improvement on our core online metric." The search summary says the online gain is statistically significant.
  - Context cut from "about 5,000 tokens down to about 1,700 tokens with only negligible degradation," and "serving cost is reduced to roughly a third."
  - Lesson: favor "short- to medium-term history with higher granularity," with older history "omitted or compressed."
  - The search summary also says GenRec needs about 40x fewer Phase-2 labeled examples.
- **Spotify, personalized narratives** (Dec 2024): LLM explanations on music, podcast, and audiobook recommendations, plus AI DJ commentary (DJ launched 2023). — [Spotify Research](https://research.atspotify.com/2024/12/contextualized-recommendations-through-personalized-narratives-using-llms)
  - "users were up to four times more likely to click on recommendations accompanied by explanations, especially for more niche content."
  - Llama 3.1 8B, domain-adapted across "10 Spotify-specific tasks," gained "up to 14%" over out-of-the-box Llama.
  - Served with vLLM, prompt caching, and quantization. No cost or latency numbers were published.
  - Failure modes: "artist attribution errors, tone inconsistencies, and factual inaccuracies," handled with expert editors' golden examples, instruction tuning, and adversarial testing.
- **Spotify, semantic IDs** (Nov 2025): items become catalog-native ID tokens. "Beam search during inference" keeps predicted IDs valid. Reported "up to a 1.96× improvement over baseline" for episode recommendation, and "up to 16% gains when scaling from 0.5B to 8B." Spotify favors "smaller base models that meet real-time latency budgets." — [Spotify Research](https://research.atspotify.com/2025/11/teaching-large-language-models-to-speak-spotify-how-semantic-ids-enable)
- **Spotify, profile-aware LLM-as-judge** (RecSys 2025): natural-language profiles distilled from 90 days of listening, then used as judge context. In a 47-participant study the judge "matched human judgments with high fidelity and outperformed or matched a variant using raw listening histories." — [Spotify Research](https://research.atspotify.com/publications/evaluating-podcast-recommendations-with-profile-aware-LLM-as-a-Judge)
- **LinkedIn MixLM** (arXiv Dec 2025; ACM KDD 2026): item text is pre-encoded into a few embedding tokens that are injected into the ranker LLM, cutting item context "from ~900 tokens to ~2 tokens per item." Deployed to "100% of job search traffic" with "a 10x throughput increase and a 0.47% DAU lift." These numbers come from a secondary summary. — [arXiv 2512.07846](https://arxiv.org/abs/2512.07846); [ACM DL](https://dl.acm.org/doi/10.1145/3770855.3818448); [summary](https://machinelearningatscale.substack.com/p/linkedins-mixlm-10x-faster-llm-ranking)
- **Amazon "Help Me Decide"** (launched Oct 23, 2025, US app and mobile web). One main pick "with a clear explanation of why it matches your needs," plus budget and upgrade alternatives. It uses browsing, purchase history, and reviews; built on Bedrock, OpenSearch, and SageMaker. No metrics were published. — [TechCrunch](https://techcrunch.com/2025/10/23/amazons-new-ai-shopping-tool-tells-you-why-you-should-buy-a-recommended-product/); [About Amazon](https://www.aboutamazon.com/news/retail/amazon-things-to-buy-help-me-decide-gen-ai)
- **Instacart** (talk at Netflix's 2025 PRS workshop, via a secondary write-up): LLM world knowledge replaced "the need for building extensive knowledge graphs," and LLM reasoning improved debuggability. — [ZenML LLMOps summary](https://www.zenml.io/llmops-database/using-llms-to-enhance-search-discovery-and-recommendations); [PRS 2025](https://prs2025.splashthat.com/)
- **Likewise** (small, cross-media consumer app) launched "Pix," an AI assistant built "using a combination of Likewise's own customer data and technology from partner OpenAI." — [TechCrunch 2023](https://techcrunch.com/2023/10/05/likewise-debuts-pix-an-ai-chatbot-for-entertainment-recommendations/)

### Inferences
- The industry pattern matches Verso's plan: a conventional retriever, then an LLM step constrained to the catalog, with shorter context to control cost. Verso cannot fine-tune or serve its own model, so the constraint has to come from the output schema and server-side validation (key question 3) rather than a scoring head.
- Spotify's 4x click-through, strongest on niche items, is the most relevant number. The reason line is probably worth more than the LLM's choice of three. Test explanation on/off as the first experiment.
- Netflix's online effect (+0.006%) versus offline (+1.6% MRR) is a warning: offline gains from LLM ranking may barely register online.

### Gaps
- No per-request cost or latency figures from Netflix, Spotify, Amazon, or LinkedIn; only relative reductions.
- Only secondary summaries were found for Instacart and for LinkedIn's DAU number.
- No primary source found for Netflix using LLM-written explanations in the product UI.

## 3. Grounding: never naming a title outside the catalog

### Takeaway
Hallucinated titles are a real risk. In open-catalog prompting they run from about 1% for canonical films to about 50% for long-tail products. With a supplied candidate list, well-behaved models still stray about 1 to 3% of the time, and some models far more. Model confidence does not predict when a title is invented, so self-filtering fails. The dependable fixes are structural. Make the model output candidate IDs only, enforced by constrained decoding: a JSON-schema enum, strict tools, or grammar or beam search over valid IDs. Then verify every returned ID and every title mentioned in the reason against the catalog on the server.

### Cited Findings
- **Open catalog** (2026 audit, including Claude Sonnet 4.6): OOD@10 of 0.6 to 2.7% on MovieLens-25M, 11.6 to 38.7% on Yelp, 49.3 to 61.0% on Amazon Toys. — [arXiv 2608.10008](https://arxiv.org/abs/2608.10008)
  - Confidence poorly predicts hallucination. Confidence varied within "a 19-point band" while catalog-hit rates varied by factors of 2.6.
  - Conformal abstention on verbalized confidence changed hallucination "by at most 1.65 pp."
  - Common string matchers are biased: the token-set rule had +0.144 net bias against human judgments, while an LLM judge had −0.040.
- **Candidate list supplied** (Beyond Utility, WWW 2025): fabricated items were "mostly around 1% and less than 5% in models other than Mistral"; Mistral was about 23% on Beauty. — [arXiv 2411.00331](https://arxiv.org/abs/2411.00331)
  - Per-dataset rates: GPT-4o 0.26 to 0.46%, GPT-4o-mini 0.18 to 1.0%, Claude 3 0.26 to 6.58% (6.58% on ML-1M).
  - Typical errors: "omitting part of the original titles, combining multiple titles, or misstating elements."
  - Fine-tuning Llama-3.1-8B cut the ML-1M hallucination rate "from a high 0.425 to a nearly negligible 0.001."
  - When hallucination is above 0.005, simple BM25 mapping back to real items "show[s] notable mapping effectiveness."
- **Candidate list, GPT-3.5** (Hou et al., ECIR 2024): out-of-candidate items "in a mere 3% of cases." The authors parsed output by substring matching (KMP) against candidate titles. — [arXiv 2305.08845](https://arxiv.org/abs/2305.08845)
- **Constrained generation**: RecLM (Microsoft, ACL 2025) compares embedding retrieval, constrained generation over rewritten titles, and item-tokenizer generation. It "strictly eradicates OOD recommendations (OOD@10 = 0) across all variants," with state-of-the-art accuracy for the constrained variants. — [arXiv 2505.03336](https://arxiv.org/abs/2505.03336)
- **Industry**: Netflix GenRec uses a catalog-aware scoring head that "eliminates out-of-catalog recommendations" ([arXiv 2608.10257](https://arxiv.org/abs/2608.10257)). Spotify uses beam search so predicted semantic IDs "correspond to valid catalog entities" ([Spotify Research](https://research.atspotify.com/2025/11/teaching-large-language-models-to-speak-spotify-how-semantic-ids-enable)).
- **Claude structured outputs**, generally available on Opus 5.5, Sonnet 5, and Haiku 4.5, use "constrained decoding with compiled grammar artifacts" and "guarantee schema-compliant responses." — [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  - Supported: `enum` (strings, numbers, bools, or nulls), `const`, and strict tool use.
  - Not supported: array `minItems` other than 0 or 1, `minLength`/`maxLength`, `pattern`, and numeric bounds.
  - "Compiled grammars are cached for 24 hours," and the first request with a new schema pays compilation latency.
  - "Changing the `output_config.format` parameter will invalidate any prompt cache."

### Inferences
- Recommended grounding for Verso, in order of strength:
  1. Label the candidates with short, stable local IDs (c01 to c30) in the prompt, and declare `pick1`, `pick2`, `pick3` each as `enum: [c01 … c30]` in a fixed schema. Map local IDs to catalog UUIDs on the server.
     - Because the enum values are the same every request, the schema is identical across users. The grammar compiles once and stays cached, and the prompt cache is not invalidated. A per-request enum of real UUIDs would change the schema on every call.
     - Using three named fields sidesteps the `minItems` limit.
  2. Validate on the server that the three IDs are distinct and in the candidate set.
  3. Check that every title quoted in a `reason` appears in the candidate list or the user's own list. A simple approach: have the model return `because_item_ids` as enum IDs, and have the server render the title text itself.
  4. On any failure, fall back to the top SQL candidates with a template reason ("Because you ranked X highly"), and log the event.
- Rendering titles from IDs instead of trusting model-written titles closes the remaining gap, where a model names an out-of-list game in free text. The audit's findings on misspelled or merged titles support this.

### Gaps
- No published measurement of how often a Claude model wrongly names a title inside free-text reasons when output IDs are constrained. Plan to measure it with an LLM judge or a string matcher, keeping in mind the matcher bias the 2026 audit reports.

## 4. Free-text notes and pairwise comparison history as taste signals; building and caching a "taste summary"

### Takeaway
Evidence that short user-written text improves ranking accuracy is weak. Review-based recommenders help only in narrow settings, and profiles built from natural-language reviews come close to ID baselines without beating them. The evidence that such text improves transparency, scrutability, explanation trust, and LLM-judge quality is good. Pairwise comparisons are a more stable preference signal than ratings, about 20% more stable over time. LLMs do not use raw ordered histories well, so the comparison log should be distilled, not pasted in. A compact natural-language taste profile of about 200 tokens, built from the list and notes and cached, is the practice that recurs across Spotify, Netflix, and research.

### Cited Findings
- **Reviews and accuracy**: Sachdeva & McAuley (SIGIR 2020) found "several cases where state-of-the-art methods fail to outperform existing baselines" when using review text, "especially as we deviate from a few narrowly-defined settings where reviews are useful." — [arXiv 2005.12210](https://arxiv.org/abs/2005.12210)
- **Natural-language profiles**: Radlinski et al. (SIGIR 2022, perspectives paper) argue for natural-language user profiles as an "explicit, transparent, and editable" representation, for transparency and scrutability. — [arXiv 2205.09403](https://arxiv.org/abs/2205.09403)
- Ramos et al. (ACL 2024) had Llama2 and Mistral-7B write natural-language profiles from reviews, capped at 200 output tokens with 5 reviews per feature. A model fed only these profiles, with no user or item IDs, came close to but did not beat matrix factorization. — [arXiv 2402.05810](https://arxiv.org/abs/2402.05810); [ACL Anthology](https://aclanthology.org/2024.acl-long.753.pdf)
  - RMSE: 0.941 to 0.944 vs. MF 0.925 on Amazon Movies/TV, and 0.804 vs. 0.786 on TripAdvisor.
  - Editing the profile changed recommendations measurably without retraining: "Coverage@10 for all targets increases."
  - More features gave "diminishing returns," and annotators found profiles "excessively long at times and contain[ing] redundant information."
- Spotify built natural-language profiles from 90 days of history. They "outperformed or matched" raw histories as LLM-judge context and reduce "input complexity." — [Spotify Research](https://research.atspotify.com/publications/evaluating-podcast-recommendations-with-profile-aware-LLM-as-a-Judge)
- Netflix GenRec compresses or drops older history and keeps short- to medium-term history in detail. Cutting context about 3x cost negligible offline accuracy. — [arXiv 2608.10257](https://arxiv.org/abs/2608.10257)
- **History length and order**: LLMs are "not sensitive to the order of the given historical user interactions." Recency-focused prompting and shorter histories help, and shorter histories also reduce popularity bias ([Hou et al., ECIR 2024](https://arxiv.org/abs/2305.08845)). LLMs do best with "shorter input histories" ([Beyond Utility, WWW 2025](https://arxiv.org/abs/2411.00331)).
- **Pairwise comparisons**: Jones, Brun & Boyer (WI-IAT 2011) found "comparisons are almost 20% more stable over time than those conveyed through ratings," and users favored the method. — [DOI 10.1109/WI-IAT.2011.13](https://doi.org/10.1109/wi-iat.2011.13)
- Kalloori, Ricci et al. (RecSys 2018) ran an online A/B test: adding pairwise preferences to ratings "can generate better recommendations than a state of the art rating-only based solution," especially "when the user is focusing on a specific type of items." — [DOI 10.1145/3240323.3240364](https://doi.org/10.1145/3240323.3240364)
- **LLM-enriched text**: LLM-Rec (NAACL 2024 Findings) shows LLM-augmented item text lifts even simple models. By analogy, notes enriched or normalized by an LLM could become features. — [arXiv 2307.15780](https://arxiv.org/abs/2307.15780)

### Inferences
- **Taste summary design for Verso:**
  - An LLM batch job writes a profile of about 150 to 250 tokens per user per medium. Inputs: tiered list, top-N with notes, dropped items with notes, and recurring note words.
  - Store it in Postgres with a `source_hash` over (list version, notes version).
  - Regenerate only when the hash changes and at least K new rankings or notes have arrived, or on a daily or weekly schedule. Use the Batch API for 50% off (key question 7).
  - Let the user view and edit it, for scrutability per Radlinski and Ramos. Edits become a strong signal.
- **Comparison log**: do not pass raw comparisons. Pass the resulting order (tier plus score), plus at most 2 or 3 "recent decisive comparisons" as tie-break hints. Hou shows LLMs ignore order in long sequences. The comparison log is better used in SQL: pairwise wins can feed a Bradley-Terry-style score or collaborative co-preference.
- **Notes**: use them mainly in the reason line and the taste summary ("you called Disco Elysium 'best writing in any game'"). Contextualized explanations that cite the user's own history raise trust (key question 5). Do not expect notes to raise hit-rate much on their own.

### Gaps
- No study found tests very short "What stood out?" notes of 5 to 20 words as input to LLM reranking. Existing work uses full reviews.
- No published guidance on refresh cadence for cached LLM taste profiles. The trigger rules above are inferred.

## 5. What makes an explanation trusted

### Takeaway
Explanations that cite the user's own history, specifically and briefly, raise trust, transparency, and intent to consume. Generic LLM explanations can do worse than none. Tintarev and Masthoff's classic work separates persuasiveness and satisfaction from effectiveness, meaning whether the user judges the item correctly. Personalized explanations were liked more but were not significantly more effective, so honesty about fit matters more than persuasion.

### Cited Findings
- **2025 user study** (759 US participants, movies, plus 140 with Claude 3.5 Sonnet) compared no explanation (NE), generic LLM explanations (GE), and contextualized LLM explanations citing the user's viewing history (CE). — [arXiv 2501.12152](https://arxiv.org/abs/2501.12152)
  - Cognitive score (transparency, trust, scrutability): CE μ = 5.38 vs. NE 4.94 and GE 4.97 (p < 0.05).
  - Consumption intent: CE 4.85 vs. GE 4.36 and NE 4.61. Generic explanations scored below no explanation.
  - More history context raised intent (β = 0.101), but participants warned "too much is overwhelming."
  - One participant's quote: citing other titles they had seen "made me trust the explanation."
- Tintarev & Masthoff (AH 2008; UMUAI 2012) varied personalization, polarity, and mention of unknown features in movie explanations. Personalized explanations "were not found to be significantly more effective" at helping users judge items, but users rated the personalized, feature-based explanations highest. — [AH 2008](https://link.springer.com/chapter/10.1007/978-3-540-70987-9_23); [UMUAI 2012](https://link.springer.com/article/10.1007/s11257-011-9117-5)
- Zhang & Chen (Foundations and Trends in IR, 2020) say explanations aim to improve "transparency, persuasiveness, effectiveness, trustworthiness, and satisfaction," and distinguish post-hoc from model-intrinsic explanations. — [arXiv 1804.11192](https://arxiv.org/abs/1804.11192)
- Spotify: explanations raised clicks up to 4x, especially for niche content, but errors in artist attribution and fact needed editorial correction. — [Spotify Research](https://research.atspotify.com/2024/12/contextualized-recommendations-through-personalized-narratives-using-llms)
- **LLMs as evaluators of explanations** (Zhang et al., RecSys 2024): GPT-4-class judges "can provide comparable evaluations with appropriate prompts." Mixing in human labels and ensembling heterogeneous LLM judges improves "accuracy and stability." — [arXiv 2406.03248](https://arxiv.org/abs/2406.03248)

### Inferences
- **Reason line rules for Verso:**
  - Cite one or two items from the user's own list, preferably ones they ranked high or wrote a note on.
  - Name one concrete shared trait: creator, theme, mechanic, tone, length.
  - Stay under about 25 words and avoid praise words.
  - Carry an honest confidence (high/medium/low). Show low-confidence picks as "a stretch" rather than hiding them.
- A post-hoc explanation from an LLM that did not do the retrieval can rationalize. Grounding the reason in the SQL features that actually produced the candidate keeps it honest (Zhang & Chen's post-hoc vs. intrinsic distinction). Examples: shared director, the collaborative neighbor item, a genre overlap. Pass a "why retrieved" field per candidate.

### Gaps
- No study found on explanations for games specifically, or on cross-medium explanations ("because you loved this game, try this film").

## 6. Prompt shape and output schema used by practitioners

### Takeaway
The common shape: a short instruction, the user's history (recent and top items, few, with recency cues), a numbered candidate list with compact facts, and a request to rank or pick, returned as IDs. Listwise prompting is the best cost-quality trade-off. Output is schema-constrained JSON with candidate IDs, not titles.

### Cited Findings
- Hou et al.'s template: "[history] … Now there are 20 candidate movies that I can watch next: '0. Sister Act', '1. Sunset Blvd', … Please rank these movies by measuring the possibilities that I would like to watch next most, according to my watching history." — [arXiv 2305.08845](https://arxiv.org/abs/2305.08845)
  - Variants: "recency-focused prompting," which adds a sentence stressing the most recent item, and in-context learning with a demonstration. Both "generally improve" results.
- Listwise beats pointwise and pairwise on cost versus performance ([Dai et al., RecSys 2023](https://arxiv.org/abs/2305.02182)).
- NIR uses a 3-step prompt: summarize user preferences, select representative items, recommend from candidates ([arXiv 2304.03153](https://arxiv.org/abs/2304.03153)).
- LLM4CDR adds "recommendation guidance," meaning features common to source and target domains. For games and movies the model surfaced "genre, themes, and popular franchises." — [arXiv 2503.07761](https://arxiv.org/abs/2503.07761)
- Netflix GenRec verbalizes items as title, release time, and synopsis, and keeps recent history in detail ([arXiv 2608.10257](https://arxiv.org/abs/2608.10257)).
- Claude structured outputs support `enum` and strict tool schemas. The first use of a schema compiles a grammar that is cached for 24 hours. — [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

### Inferences
- **Suggested prompt layout**, with the stable parts first so any prompt caching applies:
  1. System: task rules, style, and grounding rules, identical for all users.
  2. User's taste summary, cached per user.
  3. Top 8 to 12 loved items with the user's notes, 2 or 3 dropped items with notes, 2 or 3 recent decisive comparisons.
  4. Candidates c01 to c30, each one line: `id | title (year) | genres | creator | 3 theme keywords | length | community score | why retrieved`, ordered by SQL score.
  5. Instruction: "choose exactly 3".
- **Suggested output schema**:
  `{pick1:{id:enum, because_item_ids:[enum of the user's list ids], reason:string, confidence:enum[high,medium,low]}, pick2:{…}, pick3:{…}}`
  The server renders titles and checks length.
- Turn off or minimize "thinking" or reasoning for this call. It is a short listwise choice, and thinking tokens bill as output (key question 7).

### Gaps
- No A/B evidence found comparing prompt layouts for an app of this size. The layout above is synthesized from papers.

## 7. Cost per request (prices checked 2026-09-24) and caching strategies

### Takeaway
A request carrying 30 candidates, a taste summary, and about 10 loved items is roughly 2,000 to 3,000 input tokens and about 150 to 250 output tokens. On Claude Haiku 4.5 that is about $0.0035 per request, or $3.50 per 1,000 requests. On Claude Sonnet 5 it is about $0.009, and on the cheapest OpenAI and Gemini tiers $0.0002 to $0.0013.

Prompt caching barely helps at this size. Haiku 4.5 cannot cache prompts under 4,096 tokens, and Sonnet 5's minimum is 1,024. The real savings come from:
- storing each user's taste summary in the database,
- storing the three picks per user per day instead of regenerating them on every screen view,
- running refreshes through the Batch API at 50% off.

### Cited Findings
**Token size (measured on a sample prompt at 4 characters per token)**
- Sample prompt in scratchpad `costsim/`:
  - system rules: 668 characters (about 170 tokens)
  - taste summary plus 8 top items with notes, comparisons, and drops: 1,074 characters (about 270 tokens)
  - 30 candidate lines at about 190 characters each: 5,679 characters (about 1,420 tokens)
  - 3-pick JSON output: 485 characters (about 120 tokens)
- Total is about 1,860 input tokens before schema and tool overhead. The estimate budgets 2,500 input and 200 output.
- Anthropic: "1 token is approximately 4 characters." "Claude 4.7 and later models … use a newer tokenizer [that] produces approximately 30% more tokens for the same text." Sonnet 4.6 and earlier use the older one. — [Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)
- Anthropic's tool-use system prompt adds 354 tokens on Sonnet 5 and 496 on Haiku 4.5 when tools are used. Structured outputs add "an additional system prompt." — [pricing docs](https://platform.claude.com/docs/en/about-claude/pricing); [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

**Anthropic prices (per million tokens: input / output / 5-minute cache write / cache hit)** — [pricing docs](https://platform.claude.com/docs/en/about-claude/pricing); [claude.com/pricing](https://claude.com/pricing)
- Haiku 4.5: $1 / $5 / $1.25 / $0.10
- Sonnet 5: $2 / $10 / $2.50 / $0.20. The $2/$10 launch price "is now the standard price," and the planned September 1, 2026 increase to $3/$15 "will not occur."
- Opus 5.5: $4 / $20 / $5 / $0.20 (hit = 0.05x)
- Fable 5.1: $10 / $50
- Batch API: 50% off input and output (Haiku 4.5 $0.50 / $2.50; Sonnet 5 $1 / $5). Batch "stacks" with caching.
- The 1-hour cache write costs 2x base input.

**Caching rules** — [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Minimum cacheable prompt: "512 tokens for … Opus 5.5 …; 1,024 tokens for … Sonnet 5 …; 4,096 tokens for Claude Haiku 4.5."
- Cache order is "tools, system, then messages." Up to 4 breakpoints. Default TTL is 5 minutes, with a 1-hour option.

**OpenAI prices (Standard, per million tokens: input / cached input / output)** — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- gpt-6-luna: $0.10 / $0.01 / $0.50
- gpt-6-sol: $2.00 / $0.20 / $10.00
- gpt-6-astra: $10 / $1 / $50
- gpt-5.6-luna: $0.20 / $0.02 / $1.20
- gpt-5.4-mini: $0.75 / $0.075 / $4.50
- gpt-5-mini: $0.25 / $0.025 / $2.00
- gpt-5-nano: $0.05 / $0.005 / $0.40
- Batch and Flex are about 50% off.
- "Priority processing was renamed Fast mode on July 30, 2026."

**Google Gemini prices (paid tier, per million tokens: input / output / context-cache read)** — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- 2.5 Flash-Lite: $0.10 / $0.40 / $0.01
- 3.1 Flash-Lite: $0.25 / $1.50 / $0.025
- 3.5 Flash-Lite: $0.30 / $2.50 / $0.03
- 3.5 Flash: $1.50 / $9.00 / $0.15
- Output prices explicitly include "thinking tokens." Batch is about half price (e.g., 3.5 Flash-Lite input $0.15).

**Industry context**: Netflix cut serving cost about 3x by cutting context from about 5,000 to 1,700 tokens ([arXiv 2608.10257](https://arxiv.org/abs/2608.10257)). LinkedIn cut item context from about 900 tokens to about 2 tokens per item ([MixLM summary](https://machinelearningatscale.substack.com/p/linkedins-mixlm-10x-faster-llm-ranking)).

### Inferences
**Per-request cost, 2,500 input / 200 output tokens.** Newer Claude models are scaled ×1.3 to 3,250 / 260 for the tokenizer. OpenAI and Gemini tokenizers differ, so treat their rows as approximate.

| Model | $/request | $/1,000 requests |
|---|---|---|
| Claude Haiku 4.5 | 0.0035 | 3.50 |
| Claude Sonnet 5 | 0.0091 | 9.10 |
| Claude Opus 5.5 | 0.0182 | 18.20 |
| gpt-5-nano | 0.0002 | 0.21 |
| gpt-6-luna | 0.00035 | 0.35 |
| gpt-5.6-luna | 0.00074 | 0.74 |
| gpt-5-mini | 0.0010 | 1.03 |
| gpt-6-sol | 0.0070 | 7.00 |
| Gemini 2.5 Flash-Lite | 0.00033 | 0.33 |
| Gemini 3.1 Flash-Lite | 0.00093 | 0.93 |
| Gemini 3.5 Flash-Lite | 0.00125 | 1.25 |
| Gemini 3.5 Flash | 0.0056 | 5.55 |

- These exclude reasoning or "thinking" tokens. If a reasoning model spends 500 to 2,000 hidden tokens, output cost rises several-fold, so disable thinking or set it low.

**Taste summary refresh** (about 4,000 input / 300 output):
- Haiku 4.5: about $0.0055, or about $0.0028 via Batch.
- Sonnet 5: about $0.0143, or about $0.0072 via Batch.

**Per-user monthly cost** at 20 recommendation requests plus 4 summary refreshes: about $0.09 on Haiku 4.5, about $0.24 on Sonnet 5. A per-user meter of, say, 20 requests a month keeps the worst case in cents.

**Caching levers, in order of payoff:**
1. Store the output: picks per user per medium per day in Postgres, regenerated on list change or explicit refresh.
2. Store the taste summary in Postgres, rebuilt with the Batch API.
3. Store per-candidate "fact lines" as precomputed strings, so the Edge Function does no joins at request time.
4. Provider prompt caching only on models where the stable prefix clears the minimum: Opus 5.5 at 512 tokens, Sonnet 5 at 1,024, OpenAI's automatic caching. On Haiku 4.5 it will not engage below 4,096 tokens.
   - The 5-minute write costs 1.25x, so a prefix used once loses money.
   - It pays only for a "reroll" button or paging within 5 minutes.

**Shrinking tokens**: trimming candidates from 30 to 20 and candidate lines to about 25 tokens cuts input by about 40%. Hou and Beyond Utility both evaluated 20 candidates.

### Gaps
- OpenAI's minimum prompt length for automatic caching was not verified on its current pricing page.
- Per-model reasoning-token defaults and their billing were not verified for GPT-5.x and GPT-6.
- Latency (time to first token, total) for these models was not measured. No provider page gives it.
- The OpenAI model names (gpt-6-luna/sol/astra, gpt-5.6-*) are as shown on the pricing page on 2026-09-24. Their quality relative to Claude Haiku 4.5 for this task is untested here.

## 8. Evaluating LLM picks offline and online with a small user base

### Takeaway
Offline: hold out each user's most recent loved items and test whether the pipeline surfaces them, using sampled and realistic candidate sets and reporting both. Supplement with an LLM-as-judge for explanation quality and profile fit, calibrated against a small set of human labels. Online with few users: interleaving, not A/B, because it needs about 100x fewer users. Verso's own ranking flow gives an unusually rich outcome label: whether a recommended item gets played or watched, and which tier it lands in.

### Cited Findings
- Sampled-candidate evaluation (1 positive plus 19 random negatives) is standard (Hou; Beyond Utility). BIGRec warns that "assess[ing] performance using restricted sets of candidates … may not accurately reflect the models' overall ranking capabilities." — [arXiv 2308.08434](https://arxiv.org/abs/2308.08434)
- In Hou's realistic setting, with candidates from several retrieval models, absolute NDCG@10 falls to single digits and SASRec beats the LLM ([arXiv 2305.08845](https://arxiv.org/abs/2305.08845)). Offline numbers depend heavily on how candidates are built.
- LLM-as-judge for explanations: GPT-4-class judges can give "comparable evaluations," and ensembles or a few human labels improve reliability ([Zhang et al., RecSys 2024](https://arxiv.org/abs/2406.03248)).
- Profile-aware LLM judges matched human judgments in a 47-person study ([Spotify, RecSys 2025](https://research.atspotify.com/publications/evaluating-podcast-recommendations-with-profile-aware-LLM-as-a-Judge)).
- Beyond Utility argues for evaluating history-length sensitivity, candidate position bias, generation quality, and hallucination alongside accuracy and novelty ([arXiv 2411.00331](https://arxiv.org/abs/2411.00331)).
- Netflix reports that interleaving needs more than 100 times fewer users than its most sensitive A/B metric to reach 95% power (paraphrased from the post as surfaced by search). — [Netflix TechBlog](https://netflixtechblog.com/using-interleaving-in-online-experiments-to-accelerate-algorithm-innovation-at-netflix-a04ee392ec55)
- Netflix GenRec: +1.6% offline MRR became +0.006% on the core online metric ([arXiv 2608.10257](https://arxiv.org/abs/2608.10257)). Offline gains shrink online.
- The cross-domain literature warns that CDR papers often compare "against weak baselines," and that simple aggregation "should be included in any evaluation protocol." — [Ferrari Dacrema, Cantador, Fernández-Tobías, Berkovsky & Cremonesi, Recommender Systems Handbook 3rd ed. (2022)](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)

### Inferences
- **Offline harness** (one developer, Postgres):
  - For each user with at least N ranked items, hide the last 1 to 3 items added to the top tiers.
  - Run the SQL retrieval, then:
    - record the hit rate of the candidate set at 30,
    - record LLM-pick hit@3 against SQL top-3,
    - record the ranking tier of the held-out items that were picked.
  - Log the hallucination rate, which should be 0 after validation, and reason-length violations.
  - Use an LLM judge on a monthly sample of reasons, with 20 to 50 human-labeled examples as calibration.
- **Online**: log impression, tap, add to backlog, started or played, ranked, and the tier or score when ranked. "Later ranked in the top tier" is a much stronger label than click-through and is unique to Beli-style apps.
  - With few users, interleave SQL-top-3 against LLM-pick-3, or explanation-on against explanation-off in the same slot. Do not run split A/B tests.

### Gaps
- No published guidance found on minimum sample sizes for interleaving with very small cohorts (hundreds of users).

## 9. Cross-domain taste transfer: what the literature finds (movies ↔ books, games ↔ movies, music → podcasts)

### Takeaway
Cross-domain signal reliably helps new or sparse users in the target domain: Xbox users +101 to 115% for new users, Spotify music to podcasts up to +50% consumption, personality bridges +6 to 94%. The benefit shrinks as target-domain history grows and can hurt when domains are far apart. Winoto and Tang's early study says cross-domain predictions are less precise than same-domain ones with equal data, but add diversity and serendipity. For games specifically, one Amazon-based LLM study found games history helped movie recommendations (+44% hit@1) while movie history slightly hurt game recommendations (−8%). Transfer is not symmetric.

### Cited Findings
- **Winoto & Tang (New Generation Computing, 2008)**: "If You Like the Devil Wears Prada the Book, Will You also Enjoy the Devil Wears Prada the Movie?" They studied global correlation across domains, how to exploit a source domain, and how to evaluate. — [Springer](https://link.springer.com/article/10.1007/s00354-008-0041-0)
  - The Handbook chapter summarizes it: target-domain accuracy "improved if only ratings from close domains were used," and cross-domain recommendations "might benefit serendipity and diversity." — [Handbook chapter 2022](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)
  - A secondary summary: cross-domain recommendations "are less precise than those based on the same amount of preferences expressed in the target domain." — [Cantador et al. survey, 2012](http://arantxa.ii.uam.es/~cantador%20/doc/2012/ceri12a.pdf)
- **Sahebi & Brusilovsky (UMAP 2013)**, books and movies on one multi-domain service: aggregating ratings across domains "improves the accuracy of cold-start recommendations." They studied how source and target profile sizes affect quality. — [Springer](https://link.springer.com/chapter/10.1007/978-3-642-38844-6_25); summary in the [Handbook chapter](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)
- **Sahebi & Brusilovsky (RecSys 2015, "It Takes Two to Tango")** studied many domain pairs to find "factors that affect the success or failure of cross-domain collaborative filtering." They propose Canonical Correlation Analysis (CCA) between domains as the main indicator of promising source domains. Relatedness of the pair, not just data volume, decides benefit. — [ACM DL](https://dl.acm.org/doi/10.1145/2792838.2800188)
- **Elkahky, Song & He (WWW 2015, Microsoft)**: a multi-view DNN over Windows Apps, News, and Xbox Movie/TV views. — [paper PDF](https://archives.iw3c2.org/www2015/documents/proceedings/proceedings/p278.pdf)
  - Adding the Xbox movie/TV view improved App MRR "by 6% for all users and 8% for new users."
  - Against the CTR baseline, P@1 rose 25.2% for all users (0.277 → 0.347) and 115% for new users (0.142 → 0.306) on Apps. On News: 49% for all users and 101% for new users.
- **Spotify (SIGIR 2020)**: music listening used to recommend podcasts to cold-start users across 200,000+ titles gave "significant improvements in consumption of up to 50%" offline and online. The authors analyzed bias introduced by music as an input. — [arXiv 2007.13287](https://arxiv.org/abs/2007.13287)
- **Fernández-Tobías et al. (UMUAI 2016)**: personality-based cross-domain methods on movies, music, and books improved results for completely new users by "6 to 94%" and novelty by "3–40%" over popularity. — [DOI 10.1007/s11257-016-9172-z](https://doi.org/10.1007/s11257-016-9172-z)
- **Fernández-Tobías, Cantador et al. (UMUAI 2019)**: matrix factorization that uses item metadata "as a bridge between items liked by users in different domains," for new users, aiming at an accuracy-diversity trade-off. — [ACM DL](https://dl.acm.org/doi/10.1007/s11257-018-9217-6)
- **LLM4CDR (WWW Companion 2025)**, Amazon domains (Movies & TV, Video Games, CD & Vinyl, Electronics), 20/25/30 candidates with 3 positives. — [arXiv 2503.07761](https://arxiv.org/abs/2503.07761)
  - Video Games → Movies & TV: H@1 0.2269 → 0.3272 (about +44%).
  - Movies & TV → Video Games: H@1 0.2548 → 0.2344 (about −8%).
  - CD & Vinyl → Movies & TV with GPT-3.5: "64.28% MAP@1 improvement."
  - Pairs within the same subgroup (Movies, Music & Games) gained. Across subgroups, "introducing the source domain's historical sequence has a detrimental effect."
  - Guidance naming common features helped. Larger LLMs (GPT-4) beat smaller ones.
- **"Cross-Domain Recommendation Meets LLMs"** (2024): with two CDR-specific prompt designs, LLMs "outperform state-of-the-art CDR baselines across various metrics and domain combinations" in rating and ranking. — [arXiv 2411.19862](https://arxiv.org/abs/2411.19862)
- TALLRec's fine-tuned LLM "exhibits robust cross-domain generalization" between movies and books ([arXiv 2305.00447](https://arxiv.org/abs/2305.00447)). Chat-REC claims preferences "transfer to different products for cross-domain recommendations" ([arXiv 2303.14524](https://arxiv.org/abs/2303.14524)).
- **Surveys**:
  - Khan et al. (ACM Computing Surveys 2017) reviewed 94 studies. 62% define domains at the category level. MovieLens is used most (22%). The cross-domain task, as opposed to single-target, is only 10% of work. — [DOI 10.1145/3073565](https://doi.org/10.1145/3073565)
  - Zang et al. (ACM TOIS) give a two-level taxonomy of scenarios and tasks and list common datasets (Amazon, Douban). — [arXiv 2108.03357](https://arxiv.org/abs/2108.03357)
  - The Handbook chapter defines domains at the attribute, item, and system levels (games vs. films is item level). It lists overlap types: user, item, context, and "semantic overlap." It notes privacy risks of sharing across platforms. — [Handbook chapter 2022](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)
- **Psychology of cross-media taste**: Rentfrow, Goldberg & Zilca (Journal of Personality, 2011) factor-analyzed genre preferences of more than 3,000 people across music, TV and movies, and books. Five dimensions span media: "Communal, Aesthetic, Dark, Thrilling, and Cerebral." Personality explains variance beyond demographics. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-6494.2010.00662.x)

### Inferences
- For Verso, cross-domain signal is most valuable at a medium's cold start: a gamer opening Films for the first time. Weight it down as the user ranks items in the target medium.
  - Sahebi and Elkahky both show the gain concentrated in new users.
  - Winoto and Tang show that with equal data, same-domain signal is more precise.
- A simple rule, inferred: cross-medium weight = k / (k + n_target_ranked) with k ≈ 5 to 10. Show it as "Because of your games" framing so a weaker-fit pick reads as a deliberate stretch, not a mistake.
- The asymmetry is plausible: game taste carries thematic and tonal information useful for films, while film taste says little about mechanics (roguelike vs. open world). This is inferred from one Amazon study. Pull game → film/TV/book bridges from themes, tone, and narrative. Do not expect film → game transfer to say anything about mechanics or genre-as-gameplay.
- Also use cross-domain picks for diversity or serendipity (Winoto and Tang), for example one slot of three reserved for a cross-medium pick.

### Gaps
- No study found that measures individual-level correlation between video game preferences and film or book preferences on a dedicated tracker. The evidence is Amazon categories (LLM4CDR) and Xbox movie/TV-view features helping app and news recommendations (Elkahky), not games → films.
- Quantic Foundry's gamer motivation model (12 motivations, 6 clusters, 30,000+ players) does not publish links to film or book taste. — [Quantic Foundry](https://quanticfoundry.com/gamer-motivation-model/)
- Full texts of Winoto & Tang (2008) and Sahebi & Brusilovsky (2013) are paywalled. Their exact effect sizes are not recorded here.

## 10. Practical low-data bridges between games, films, TV, and books

### Takeaway
With little data and no shared-user corpus, the proven bridges are content-level, called "semantic overlap":
- shared tags, themes, and moods in one vocabulary,
- creator, franchise, and adaptation links,
- text embeddings of summaries as a common space,
- an LLM that names the shared features (the "recommendation guidance" in LLM4CDR).

A small set of cross-media dimensions like Rentfrow's five (Communal, Aesthetic, Dark, Thrilling, Cerebral) is a defensible, psychology-backed choice for a mood or tone layer.

### Cited Findings
- **Tags as bridges**: Shi, Larson & Hanjalic's "Tags as bridges between domains" varied the number of overlapping tags from 5 to 50. Abel et al. mapped tags from different systems to WordNet and DBpedia to build category-based profiles that "revealed significantly more user information." — [Handbook chapter 2022](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)
- **Metadata as a bridge in MF for new users**: Fernández-Tobías et al., UMUAI 2019 ([ACM DL](https://dl.acm.org/doi/10.1007/s11257-018-9217-6)). A knowledge-graph or metadata bridge is the standard low-overlap technique.
- **Text as a universal item representation**: UniSRec (Hou et al., KDD 2022) "utilizes the associated description text of items to learn transferable representations across different recommendation scenarios," including "cross-platform." — [DOI 10.1145/3534678.3539381](https://doi.org/10.1145/3534678.3539381)
  - But as a zero-shot ranker it trails LLMs: NDCG@10 26.67 vs. GPT-3.5 48.80 on ML-1M ([Hou et al.](https://arxiv.org/abs/2305.08845)).
- **LLM "recommendation guidance"**: stating common features between source and target improved cross-domain accuracy. For games and movies the model identified "genre, themes, and popular franchises." — [arXiv 2503.07761](https://arxiv.org/abs/2503.07761)
- **LLM-enriched item text**: LLM-Rec shows prompting an LLM to enrich item descriptions lets even an MLP match complex content models ([arXiv 2307.15780](https://arxiv.org/abs/2307.15780)). The same approach can normalize IGDB themes, TMDB keywords, and book subjects into one vocabulary.
- **Cross-media taste dimensions**: Communal, Aesthetic, Dark, Thrilling, Cerebral, from more than 3,000 people across music, film/TV, and books ([Rentfrow et al., 2011](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-6494.2010.00662.x)).
- Personality as a bridge improved new-user results 6 to 94% ([Fernández-Tobías et al., 2016](https://doi.org/10.1007/s11257-016-9172-z)). This requires eliciting personality, which Verso does not do.
- **Mood genome precedent**: Jinni's "Entertainment Genome" indexed titles by mood, tone, plot, and structure with about 2,200 "genes," from a professional ontology plus NLP over metadata and reviews. — [Wikipedia](https://en.wikipedia.org/wiki/Jinni_(search_engine)); [VC Cafe 2009](https://www.vccafe.com/2009/11/26/global-from-day-one-jinni-sequences-the-movie-genome-to-provide-better-movie-recommendations/)
- Simple aggregation of preferences across domains is "one simple yet effective baseline that should be included in any evaluation protocol." — [Handbook chapter 2022](https://shlomo-berkovsky.github.io/files/pdf/Springer22c.pdf)

### Inferences
**Bridges proportionate to one developer and Postgres:**
1. **Shared theme and mood vocabulary**, about 40 to 80 tags, including tone tags aligned with Rentfrow's five. An offline LLM batch job maps IGDB themes and keywords, TMDB keywords, and book subjects into it and stores `item_tags(item_id, tag, weight)`. Cross-medium candidates come from a SQL query: user tag profile (weighted by tier and score) dot item tags.
2. **Creator and adaptation edges**: director, writer, or composer who also worked on a game; game ↔ film/TV adaptations; shared franchise or IP. Store them in an `item_links` table. These are high-precision, explainable picks ("from the studio behind…", "the adaptation of…").
3. **Embeddings**: one text-embedding model over synopsis plus tags for every medium, stored in `pgvector`. The user vector is the mean of top-tier item vectors per medium, and a nearest-neighbor query in the other medium gives cross-medium candidates. It needs no co-consumption data.
4. **LLM as bridge explainer, not retriever**: the LLM step receives cross-medium candidates retrieved via 1 to 3 and states the shared trait. This is the guidance idea from LLM4CDR, with grounding kept intact.
5. **Collaborative cross-medium signal** (users who ranked game X top also ranked film Y top) is added only once there is enough overlap. Aggregation is the recommended baseline to beat.

### Gaps
- No published comparison was found of embeddings vs. tags vs. creator links for game ↔ film transfer specifically.
- No public mapping between IGDB themes and TMDB keywords was found.

## 11. Products that recommend across media and what they say about method

### Takeaway
TasteDive/Qloo, Likewise, and historically Jinni are the main cross-media recommenders. They describe their methods as either entity-to-entity co-occurrence plus metadata ("hybrid embeddings" at Qloo, which trains on "joins between entities") or a curated attribute genome (Jinni). Likewise now runs an OpenAI-based assistant over its own preference data. None publishes accuracy numbers for game → film transfer.

### Cited Findings
- **TasteDive** recommends across "authors, books, games, music, movies, TV shows and podcasts." It was acquired in 2019 by Qloo. — [PR Newswire](https://www.prnewswire.com/news-releases/qloo-the-leading-artificial-intelligence-platform-for-culture-and-taste-acquires-tastedive-300794951.html)
- **Qloo "Taste AI"** claims cross-domain predictions across dining, entertainment, music, and film. "Hybrid embeddings" merge "insights from user interactions with the rich metadata of entities" and model "cultural correlations." The company says it operates "without processing any Personally Identifiable Information." These are vendor claims. — [Qloo blog](https://www.qloo.com/resources/unlocking-the-power-of-taste-how-qloos-taste-ai-predicts-what-you-like); [Qloo Taste AI](https://www.qloo.com/technology/taste-ai)
  - In a podcast, Qloo says it trains on "joins between entities," with nothing to do with consumer identity. — [SourceForge podcast](https://sourceforge.net/articles/sourceforge-podcast-with-qloo-a-fascinating-cultural-ai-that-predicts-consumer-taste/)
- **Likewise** (founded 2017, backed by Bill Gates) covers movies, TV, books, and podcasts. Users pick genres, then titles per medium, then rate. Its assistant "Pix" is built on Likewise data plus OpenAI technology. The company claims more than 6 million users and "600 million preferences" (vendor claim). — [TechCrunch 2023](https://techcrunch.com/2023/10/05/likewise-debuts-pix-an-ai-chatbot-for-entertainment-recommendations/); [PR Newswire](https://www.prnewswire.com/news-releases/entertainment-discovery-platform-likewise-introduces-new-ai-powered-mobile-app-upgrades-to-its-content-recommendations-ecosystem-302087504.html); [MakeUseOf](https://www.makeuseof.com/what-is-likewise/)
- **Jinni** used a mood and "Entertainment Genome" taste engine (about 2,200 genes). It was no longer public by 2015 and continued as B2B licensing, reportedly used by Xfinity. — [Wikipedia](https://en.wikipedia.org/wiki/Jinni_(search_engine))
- **Chat-REC** frames the LLM itself as the cross-domain bridge in a conversational setting. — [arXiv 2303.14524](https://arxiv.org/abs/2303.14524)

### Inferences
- The products converge on two ingredients Verso can copy cheaply: a structured attribute or mood layer (Jinni) and entity-to-entity links (Qloo/TasteDive "people who like X like Y" across media). Verso's differentiator would be explanations grounded in the user's own ranked list and notes, which none of these products documents.

### Gaps
- No product found publishes evaluation numbers for cross-medium recommendations.
- No mainstream product was found with a "because you loved this game, watch this film" feature and a documented method. Likewise and TasteDive document cross-medium coverage but not the game ↔ film mechanism specifically.
